import { useEffect, useRef, useState } from 'react';
import { Chamada, microfoneDisponivel } from './chamada.js';
import { socket, pedir } from './socket.js';
import { lerOpcoes, salvarOpcoes, capturarTela, ajustarCaptura, ajustesDeEnvio } from './tela.js';

const LIMIAR_FALA = 0.02; // volume (0 a 1) a partir do qual a pessoa conta como "falando"

// Compara duas medições de qualidade (para não redesenhar a sala quando nada mudou).
function mesmaQualidade(a, b) {
  if (a.size !== b.size) return false;
  for (const [id, q] of a) {
    const o = b.get(id);
    if (!o || o.estado !== q.estado || o.ping !== q.ping || o.direta !== q.direta) return false;
    if (Math.round(o.perda ?? -1) !== Math.round(q.perda ?? -1)) return false;
  }
  return true;
}

// Mede o volume de um áudio para mostrar quem está falando.
function criarMedidor(contexto, stream) {
  const fonte = contexto.createMediaStreamSource(stream);
  const analisador = contexto.createAnalyser();
  analisador.fftSize = 512;
  fonte.connect(analisador);
  const dados = new Float32Array(analisador.fftSize);
  return {
    volume() {
      analisador.getFloatTimeDomainData(dados);
      let soma = 0;
      for (const v of dados) soma += v * v;
      return Math.sqrt(soma / dados.length);
    },
    desligar() {
      fonte.disconnect();
    },
  };
}

// Liga a sala à chamada: microfone, áudio dos outros, quem está falando e a transmissão de tela.
export function useChamada(sala, eu) {
  const [micLigado, setMicLigado] = useState(false);
  const [erroMic, setErroMic] = useState('');
  const [falando, setFalando] = useState(() => new Set());
  const [precisaToque, setPrecisaToque] = useState(false);
  const [telasRemotas, setTelasRemotas] = useState(() => new Map()); // id -> MediaStream
  const [minhaTela, setMinhaTela] = useState(null);
  const [opcoesTela, setOpcoesTela] = useState(lerOpcoes);
  const opcoesTelaRef = useRef(opcoesTela);
  const [erroTela, setErroTela] = useState('');
  const [qualidade, setQualidade] = useState(() => new Map()); // id -> { estado, ping, perda, direta }

  const chamada = useRef(null);
  const audios = useRef(new Map()); // id -> <audio>
  const medidores = useRef(new Map()); // id -> medidor
  const contexto = useRef(null);

  function obterContexto() {
    contexto.current ??= new AudioContext();
    if (contexto.current.state === 'suspended') contexto.current.resume().catch(() => {});
    return contexto.current;
  }

  function trocarMedidor(id, stream) {
    medidores.current.get(id)?.desligar();
    medidores.current.set(id, criarMedidor(obterContexto(), stream));
  }

  function removerPessoa(id) {
    setTelasRemotas((antes) => {
      if (!antes.has(id)) return antes;
      const novo = new Map(antes);
      novo.delete(id);
      return novo;
    });
    audios.current.get(id)?.remove();
    audios.current.delete(id);
    medidores.current.get(id)?.desligar();
    medidores.current.delete(id);
  }

  // Cria a chamada ao entrar na sala.
  useEffect(() => {
    if (!eu) return;
    const c = new Chamada({
      meuId: eu,
      aoReceberAudio: (id, stream) => {
        let audio = audios.current.get(id);
        if (!audio) {
          audio = document.createElement('audio');
          audio.autoplay = true;
          audio.playsInline = true;
          document.body.appendChild(audio);
          audios.current.set(id, audio);
        }
        audio.srcObject = stream;
        audio.play().catch(() => setPrecisaToque(true));
        trocarMedidor(id, stream);
      },
      aoReceberTela: (id, stream) => setTelasRemotas((antes) => new Map(antes).set(id, stream)),
      aoPessoaSair: removerPessoa,
    });
    chamada.current = c;

    // Atualiza quem está falando ~6 vezes por segundo (só com a aba visível e alguém com áudio).
    const intervalo = setInterval(() => {
      if (document.hidden || medidores.current.size === 0) return;
      const agora = new Set();
      for (const [id, m] of medidores.current) if (m.volume() > LIMIAR_FALA) agora.add(id);
      setFalando((antes) =>
        antes.size === agora.size && [...agora].every((id) => antes.has(id)) ? antes : agora,
      );
    }, 150);

    // Mede a qualidade das conexões a cada 2 s (só com a aba visível).
    const intervaloQualidade = setInterval(async () => {
      if (document.hidden) return;
      const nova = await c.medirQualidade();
      setQualidade((antes) => (mesmaQualidade(antes, nova) ? antes : nova));
    }, 2000);

    return () => {
      clearInterval(intervalo);
      clearInterval(intervaloQualidade);
      c.encerrar();
      chamada.current = null;
      for (const id of [...audios.current.keys(), ...medidores.current.keys()]) removerPessoa(id);
      // Fecha o processamento de áudio da sala (antes ficava aberto para sempre a cada entrada).
      contexto.current?.close().catch(() => {});
      contexto.current = null;
      setMicLigado(false);
      setMinhaTela(null);
      setTelasRemotas(new Map());
    };
  }, [eu]);

  // Quando alguém para de transmitir, solta o vídeo dessa tela (antes ficava guardado até a pessoa sair).
  const transmissor = sala?.transmissao?.por ?? null;
  useEffect(() => {
    setTelasRemotas((antes) => {
      const sobrando = [...antes.keys()].filter((id) => id !== transmissor);
      if (sobrando.length === 0) return antes;
      const novo = new Map(antes);
      for (const id of sobrando) novo.delete(id);
      return novo;
    });
  }, [transmissor]);

  // Conecta com quem está na sala e desconecta de quem saiu.
  const ids = sala?.participantes.map((p) => p.id).join(',') ?? '';
  useEffect(() => {
    if (chamada.current && ids) chamada.current.atualizarParticipantes(ids.split(','));
  }, [ids, eu]);

  // Se a conexão caiu e voltou, o servidor esquece o mic: avisa de novo.
  const micNoServidor = sala?.participantes.find((p) => p.id === eu)?.mic;
  useEffect(() => {
    if (sala && micNoServidor !== undefined && micNoServidor !== micLigado) socket.emit('sala:mic', micLigado);
  }, [micNoServidor, micLigado]);

  async function alternarMic() {
    const c = chamada.current;
    if (!c) return;
    if (micLigado) {
      c.desligarMicrofone();
      setMicLigado(false);
      return;
    }
    try {
      const stream = await c.ligarMicrofone();
      if (!medidores.current.has(eu)) trocarMedidor(eu, stream);
      setErroMic('');
      setMicLigado(true);
    } catch (e) {
      setErroMic(
        e?.name === 'NotAllowedError'
          ? 'Você não deixou o site usar o microfone. Libere no cadeado ao lado do endereço.'
          : e?.name === 'NotFoundError'
            ? 'Nenhum microfone encontrado.'
            : 'Não foi possível ligar o microfone.',
      );
    }
  }

  async function iniciarTela() {
    const c = chamada.current;
    if (!c) return;
    setErroTela('');
    const vaga = await pedir('tela:iniciar');
    if (vaga.erro === 'ocupado') return setErroTela(`${vaga.apelido} já está transmitindo.`);
    if (vaga.erro) return setErroTela('Não foi possível começar a transmissão.');

    let stream;
    try {
      stream = await capturarTela(opcoesTelaRef.current);
    } catch (e) {
      socket.emit('tela:parar');
      if (e?.name !== 'NotAllowedError') setErroTela('Não foi possível capturar a tela.');
      return; // NotAllowedError = a pessoa cancelou a janela de escolha
    }
    // Quando a pessoa clica em "Parar de compartilhar" na barra do navegador.
    stream.getVideoTracks()[0].addEventListener('ended', () => pararTela());
    await c.iniciarTela(stream, ajustesDeEnvio(opcoesTelaRef.current));
    setMinhaTela(stream);
  }

  async function pararTela() {
    await chamada.current?.pararTela();
    socket.emit('tela:parar');
    setMinhaTela(null);
  }

  // Muda uma opção por vez, sempre em cima da versão mais recente (cliques rápidos não se perdem).
  async function mudarOpcaoTela(campo, valor) {
    const novas = { ...opcoesTelaRef.current, [campo]: valor };
    opcoesTelaRef.current = novas;
    setOpcoesTela(novas);
    salvarOpcoes(novas);
    if (minhaTela) {
      await ajustarCaptura(minhaTela, novas);
      await chamada.current?.ajustarTela(ajustesDeEnvio(novas));
    }
  }

  // Toque para liberar o som, se o navegador bloqueou.
  function liberarAudio() {
    obterContexto();
    for (const audio of audios.current.values()) audio.play().catch(() => {});
    setPrecisaToque(false);
  }

  return {
    micDisponivel: microfoneDisponivel,
    micLigado,
    alternarMic,
    erroMic,
    limparErroMic: () => setErroMic(''),
    falando,
    qualidade,
    precisaToque,
    liberarAudio,
    // Tela
    minhaTela,
    iniciarTela,
    pararTela,
    opcoesTela,
    mudarOpcaoTela,
    erroTela,
    limparErroTela: () => setErroTela(''),
    // Só mostra a tela de quem o servidor diz que está transmitindo (evita imagem velha travada).
    telaRemota: sala?.transmissao && sala.transmissao.por !== eu ? (telasRemotas.get(sala.transmissao.por) ?? null) : null,
  };
}
