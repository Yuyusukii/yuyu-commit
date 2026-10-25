import { socket } from './socket.js';

// Chamada da sala com WebRTC: cada pessoa se conecta direto com cada uma das outras
// (até 8 pessoas isso funciona bem). O servidor só repassa as mensagens para combinar
// a conexão; o áudio não passa por ele.

const BITRATE_AUDIO = 128_000; // 128 kbps, voz bem limpa (o padrão do navegador é ~32 kbps)

let servidoresIce;
async function obterServidoresIce() {
  servidoresIce ??= fetch('/api/ice')
    .then((r) => r.json())
    .catch(() => [{ urls: 'stun:stun.l.google.com:19302' }]);
  return servidoresIce;
}

// Ajusta o Opus (codec de voz) no SDP: correção de perdas (FEC), estéreo e taxa alta.
function melhorarOpus(sdp) {
  const linhaRtpmap = sdp.match(/a=rtpmap:(\d+) opus\/48000/i);
  if (!linhaRtpmap) return sdp;
  const pt = linhaRtpmap[1];
  return sdp.replace(new RegExp(`a=fmtp:${pt} (.*)`), (_linha, params) => {
    const extras = { useinbandfec: 1, stereo: 1, 'sprop-stereo': 1, maxaveragebitrate: BITRATE_AUDIO };
    const atuais = Object.fromEntries(params.split(';').map((p) => p.trim().split('=')));
    return `a=fmtp:${pt} ${Object.entries({ ...atuais, ...extras })
      .map(([k, v]) => `${k}=${v}`)
      .join(';')}`;
  });
}

// Faz o vídeo já começar numa taxa boa, em vez de subir devagar a partir de ~300 kbps
// (sem isso a tela leva uns 15 s para chegar na qualidade escolhida).
const BITRATE_INICIAL_VIDEO_KBPS = 2500;

function melhorarVideo(sdp) {
  const codecs = [...sdp.matchAll(/a=rtpmap:(\d+) (VP8|VP9|H264|AV1)\/90000\r\n/gi)];
  for (const [linha, pt] of codecs) {
    const extra = `x-google-start-bitrate=${BITRATE_INICIAL_VIDEO_KBPS}`;
    const fmtp = new RegExp(`a=fmtp:${pt} (.*)\\r\\n`);
    sdp = fmtp.test(sdp)
      ? sdp.replace(fmtp, (_l, params) => `a=fmtp:${pt} ${params};${extra}\r\n`)
      : sdp.replace(linha, `${linha}a=fmtp:${pt} ${extra}\r\n`);
  }
  return sdp;
}

// Uma conexão com outra pessoa, usando o padrão "perfect negotiation" do WebRTC:
// os dois lados podem propor mudanças (ligar mic, transmitir tela) sem se atrapalhar.
class Conexao {
  constructor({ meuId, outroId, iceServers, aoReceberFaixa }) {
    this.outroId = outroId;
    this.educado = meuId < outroId; // em caso de conflito, o "educado" cede
    this.fazendoOferta = false;
    this.ignorandoOferta = false;
    this.telaStreamId = null; // id do stream da tela que esta pessoa transmite (avisado antes das faixas)
    this.pc = new RTCPeerConnection({ iceServers });

    this.pc.onnegotiationneeded = async () => {
      try {
        this.fazendoOferta = true;
        await this.pc.setLocalDescription();
        this.enviar({ descricao: this.descricaoLocal() });
      } catch (e) {
        console.warn('[chamada] falha ao negociar', e);
      } finally {
        this.fazendoOferta = false;
      }
    };
    this.pc.onicecandidate = ({ candidate }) => candidate && this.enviar({ candidato: candidate });
    this.pc.ontrack = ({ track, streams }) =>
      aoReceberFaixa(outroId, track, streams[0], streams[0]?.id === this.telaStreamId);
    this.pc.onconnectionstatechange = () => {
      const estado = this.pc.connectionState;
      clearTimeout(this.timerQueda);
      if (estado === 'failed') this.pc.restartIce();
      // "disconnected" às vezes volta sozinho; se não voltar em 4 s, refaz a rota.
      if (estado === 'disconnected') {
        this.timerQueda = setTimeout(() => {
          if (this.pc.connectionState === 'disconnected') this.pc.restartIce();
        }, 4000);
      }
    };

    // Um canal de dados conecta as duas pessoas logo ao entrar, mesmo sem mic nem tela:
    // assim ligar o mic/transmitir começa mais rápido e dá para medir a qualidade da conexão.
    // Só um dos lados cria, para não haver dois canais.
    if (this.educado) this.canal = this.pc.createDataChannel('yuyu');

    this.ultimaMedida = null;
  }

  // Ping e perda de pacotes desta conexão (desde a última medida).
  async medir() {
    const estado = this.pc.connectionState;
    if (estado !== 'connected') return { estado };
    const stats = await this.pc.getStats();
    let par = null;
    let recebidos = 0;
    let perdidos = 0;
    stats.forEach((r) => {
      if (r.type === 'transport' && r.selectedCandidatePairId) par = stats.get(r.selectedCandidatePairId);
      if (r.type === 'inbound-rtp') {
        recebidos += r.packetsReceived ?? 0;
        perdidos += r.packetsLost ?? 0;
      }
    });
    if (!par) stats.forEach((r) => r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded' && (par = r));

    const anterior = this.ultimaMedida;
    this.ultimaMedida = { recebidos, perdidos };
    const novosRecebidos = recebidos - (anterior?.recebidos ?? 0);
    const novosPerdidos = Math.max(0, perdidos - (anterior?.perdidos ?? 0));
    const total = novosRecebidos + novosPerdidos;

    return {
      estado,
      ping: par?.currentRoundTripTime != null ? Math.round(par.currentRoundTripTime * 1000) : null,
      perda: total > 50 ? (novosPerdidos / total) * 100 : null, // só conta com mídia chegando
      direta: par ? stats.get(par.remoteCandidateId)?.candidateType !== 'relay' : null,
    };
  }

  descricaoLocal() {
    const { type, sdp } = this.pc.localDescription;
    return { type, sdp: melhorarVideo(melhorarOpus(sdp)) };
  }

  enviar(dados) {
    socket.emit('rtc:sinal', { para: this.outroId, dados });
  }

  async receber({ descricao, candidato, tela }) {
    try {
      if (tela !== undefined) {
        this.telaStreamId = tela;
      } else if (descricao) {
        const colisao =
          descricao.type === 'offer' && (this.fazendoOferta || this.pc.signalingState !== 'stable');
        this.ignorandoOferta = !this.educado && colisao;
        if (this.ignorandoOferta) return;

        await this.pc.setRemoteDescription(descricao);
        if (descricao.type === 'offer') {
          await this.pc.setLocalDescription();
          this.enviar({ descricao: this.descricaoLocal() });
        }
      } else if (candidato) {
        try {
          await this.pc.addIceCandidate(candidato);
        } catch (e) {
          if (!this.ignorandoOferta) throw e;
        }
      }
    } catch (e) {
      console.warn('[chamada] falha ao receber sinal', e);
    }
  }

  async adicionarFaixa(track, stream, ajustes) {
    if (this.pc.getSenders().some((s) => s.track === track)) return;
    const sender = this.pc.addTrack(track, stream);
    if (ajustes) await this.ajustarFaixa(track, ajustes);
  }

  // Limites de envio de uma faixa: taxa de bits, fps e o que priorizar quando a rede apertar.
  async ajustarFaixa(track, { bitrate, fps, prioridade }) {
    const sender = this.pc.getSenders().find((s) => s.track === track);
    if (!sender) return;
    const params = sender.getParameters();
    params.encodings = params.encodings?.length ? params.encodings : [{}];
    if (bitrate) params.encodings[0].maxBitrate = bitrate;
    if (fps) params.encodings[0].maxFramerate = fps;
    if (prioridade) params.degradationPreference = prioridade;
    await sender.setParameters(params).catch((e) => console.warn('[chamada] ajuste não aplicado', e));
  }

  removerFaixas(tracks) {
    for (const sender of this.pc.getSenders()) {
      if (sender.track && tracks.includes(sender.track)) this.pc.removeTrack(sender);
    }
  }

  fechar() {
    clearTimeout(this.timerQueda);
    this.pc.close();
  }
}

// Gerencia todas as conexões da sala.
export class Chamada {
  constructor({ meuId, aoReceberAudio, aoReceberTela, aoPessoaSair }) {
    this.meuId = meuId;
    this.conexoes = new Map();
    this.microfone = null; // MediaStream do microfone, depois de ligado a primeira vez
    this.tela = null; // { stream, ajustes } enquanto esta pessoa transmite a tela
    this.aoReceberAudio = aoReceberAudio;
    this.aoReceberTela = aoReceberTela;
    this.aoPessoaSair = aoPessoaSair;
    this.aoSinal = ({ de, dados }) => this.conexao(de).then((c) => c.receber(dados));
    socket.on('rtc:sinal', this.aoSinal);
  }

  async conexao(outroId) {
    if (!this.conexoes.has(outroId)) {
      const promessa = obterServidoresIce().then((iceServers) => {
        const c = new Conexao({
          meuId: this.meuId,
          outroId,
          iceServers,
          aoReceberFaixa: (id, track, stream, ehTela) => {
            if (ehTela) this.aoReceberTela(id, stream);
            else if (track.kind === 'audio') this.aoReceberAudio(id, stream);
          },
        });
        // Quem chega depois que o mic já está ligado (ou a tela já está sendo transmitida) também recebe.
        const faixaMic = this.microfone?.getAudioTracks()[0];
        if (faixaMic) c.adicionarFaixa(faixaMic, this.microfone, { bitrate: BITRATE_AUDIO });
        if (this.tela) this.enviarTela(c);
        return c;
      });
      this.conexoes.set(outroId, promessa);
    }
    return this.conexoes.get(outroId);
  }

  // Mantém uma conexão com cada pessoa da sala e fecha as de quem saiu.
  async atualizarParticipantes(ids) {
    const outros = ids.filter((id) => id !== this.meuId);
    for (const [id, promessa] of this.conexoes) {
      if (!outros.includes(id)) {
        this.conexoes.delete(id);
        (await promessa).fechar();
        this.aoPessoaSair(id);
      }
    }
    await Promise.all(outros.map((id) => this.conexao(id)));
  }

  // Qualidade da conexão com cada pessoa: id -> { estado, ping, perda, direta }.
  async medirQualidade() {
    const resultado = new Map();
    for (const [id, promessa] of this.conexoes) {
      try {
        resultado.set(id, await (await promessa).medir());
      } catch {
        // Conexão fechando: ignora nesta rodada.
      }
    }
    return resultado;
  }

  // Liga o microfone (pede permissão na primeira vez) ou só tira o mudo.
  async ligarMicrofone() {
    if (!this.microfone) {
      this.microfone = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
      });
      const faixa = this.microfone.getAudioTracks()[0];
      for (const promessa of this.conexoes.values()) {
        (await promessa).adicionarFaixa(faixa, this.microfone, { bitrate: BITRATE_AUDIO });
      }
    }
    this.microfone.getAudioTracks().forEach((t) => (t.enabled = true));
    return this.microfone;
  }

  // Mudo: a faixa continua conectada, só para de mandar som (religar é instantâneo).
  desligarMicrofone() {
    this.microfone?.getAudioTracks().forEach((t) => (t.enabled = false));
  }

  enviarTela(conexao) {
    const { stream, ajustes } = this.tela;
    conexao.enviar({ tela: stream.id }); // avisa antes, para o outro lado saber que essas faixas são a tela
    for (const track of stream.getTracks()) {
      conexao.adicionarFaixa(track, stream, track.kind === 'video' ? ajustes : { bitrate: BITRATE_AUDIO });
    }
  }

  // Começa a mandar a tela capturada para todo mundo da sala.
  async iniciarTela(stream, ajustes) {
    this.tela = { stream, ajustes };
    for (const promessa of this.conexoes.values()) this.enviarTela(await promessa);
  }

  // Muda qualidade/fps/bitrate sem parar a transmissão.
  async ajustarTela(ajustes) {
    if (!this.tela) return;
    this.tela.ajustes = ajustes;
    const video = this.tela.stream.getVideoTracks()[0];
    for (const promessa of this.conexoes.values()) (await promessa).ajustarFaixa(video, ajustes);
  }

  async pararTela() {
    if (!this.tela) return;
    const tracks = this.tela.stream.getTracks();
    this.tela = null;
    for (const promessa of this.conexoes.values()) {
      const c = await promessa;
      c.removerFaixas(tracks);
      c.enviar({ tela: null });
    }
    tracks.forEach((t) => t.stop());
  }

  async encerrar() {
    socket.off('rtc:sinal', this.aoSinal);
    this.microfone?.getTracks().forEach((t) => t.stop());
    this.tela?.stream.getTracks().forEach((t) => t.stop());
    for (const promessa of this.conexoes.values()) (await promessa).fechar();
    this.conexoes.clear();
  }
}

// Microfone só funciona em https ou no próprio PC (localhost). É regra dos navegadores.
export const microfoneDisponivel = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
