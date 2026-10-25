import { useEffect, useRef, useState } from 'react';
import { socket, pedir } from '../lib/socket.js';
import { ESTADOS } from '../lib/players/comum.js';
import { criarPlayerYoutube } from '../lib/players/youtube.js';
import { criarPlayerVimeo } from '../lib/players/vimeo.js';
import { criarPlayerTwitchVideo } from '../lib/players/twitch.js';

const { TOCANDO, PAUSADO, CARREGANDO, FIM } = ESTADOS;

const CRIADORES = {
  youtube: criarPlayerYoutube,
  vimeo: criarPlayerVimeo,
  'twitch-video': criarPlayerTwitchVideo,
};

const TOLERANCIA = 0.5; // segundos de diferença aceitos antes de corrigir
const PULO_MINIMO = 3; // diferença a partir da qual é considerado que a pessoa pulou no vídeo
const INTERVALO_CORRECAO_MS = 5000; // correções pequenas no máximo a cada 5 s
const IGNORAR_MS = 1000; // depois de aplicar uma ação de outra pessoa, ignora os eventos que ela gera

const agora = () => performance.now();

// Player sincronizado (YouTube, Vimeo ou vídeo gravado da Twitch): quando alguém dá play, pausa
// ou pula, todo mundo acompanha. Cada vídeo novo monta um player novo (o Palco usa key=versao).
//
// Como funciona: cada player guarda onde o vídeo "deveria" estar (esperado). Quando a própria
// pessoa mexe no vídeo, isso é enviado ao servidor, que repassa aos outros. Quando chega uma
// ação de outra pessoa, o player vai para aquele ponto e dá play/pausa.
export default function PlayerSincronizado({ video, aoAcaoRemota }) {
  const caixa = useRef(null);
  const player = useRef(null); // adaptador (ver lib/players/comum.js)
  const [erro, setErro] = useState(null);
  const [bloqueado, setBloqueadoEstado] = useState(false);
  const bloqueadoRef = useRef(false);
  function setBloqueado(valor) {
    bloqueadoRef.current = valor;
    setBloqueadoEstado(valor);
  }

  const esperado = useRef({ tocando: false, tempo: video.inicio, em: agora() });
  const ignorarAte = useRef(0);
  const travada = useRef({ inicio: 0, duracao: 0 });
  const proximaCorrecao = useRef(0);
  // Quanto este player costuma atrasar depois de pular (aprende sozinho), para já pular à frente.
  const compensacao = useRef(0);
  const corrigiu = useRef(false);
  const pendente = useRef(null);
  const aoAcaoRemotaRef = useRef(aoAcaoRemota);
  aoAcaoRemotaRef.current = aoAcaoRemota;

  function posicaoEsperada() {
    const e = esperado.current;
    return e.tocando ? e.tempo + (agora() - e.em) / 1000 : e.tempo;
  }

  // A pessoa mexeu no vídeo: avisa os outros.
  function enviar(tocando) {
    const tempo = player.current.tempo();
    esperado.current = { tocando, tempo, em: agora() };
    socket.emit('video:controle', { versao: video.versao, tocando, tempo });
  }

  // Chegou o estado do servidor (ação de outra pessoa, ou ao entrar).
  function aplicar(estado) {
    if (!estado || estado.versao !== video.versao) return;
    if (!player.current) {
      pendente.current = estado;
      return;
    }
    const p = player.current;
    esperado.current = { tocando: estado.tocando, tempo: estado.tempo, em: agora() };
    ignorarAte.current = agora() + IGNORAR_MS;

    if (Math.abs(p.tempo() - estado.tempo) > TOLERANCIA) p.pular(estado.tempo);
    if (estado.tocando) {
      p.tocar();
      verificarBloqueio();
    } else {
      p.pausar();
      setBloqueado(false);
    }
  }

  // O navegador pode bloquear o play automático até a pessoa tocar na página. Se em alguns segundos
  // o vídeo não estiver tocando, oferece o toque. "Carregando" ganha mais tempo (rede lenta, anúncio
  // da Twitch), mas se nunca sair disso também conta como bloqueado.
  function verificarBloqueio(tentativa = 0) {
    setTimeout(() => {
      const s = player.current?.estado();
      if (!s || !esperado.current.tocando || s === TOCANDO) return;
      if (s === CARREGANDO && tentativa < 3) return verificarBloqueio(tentativa + 1);
      setBloqueado(true);
    }, 2500);
  }

  function pedirEstado() {
    pedir('video:estado').then(aplicar);
  }

  function aoMudarEstado(s) {
    if (s === CARREGANDO) {
      travada.current.inicio = agora();
      return;
    }
    if (travada.current.inicio) {
      travada.current.duracao = (agora() - travada.current.inicio) / 1000;
      travada.current.inicio = 0;
    }
    if (!player.current) return;
    // Estava bloqueado e a pessoa deu play no próprio player: entra no ponto em que os outros estão.
    if (bloqueadoRef.current && s === TOCANDO && esperado.current.tocando) {
      setBloqueado(false);
      ignorarAte.current = agora() + IGNORAR_MS;
      player.current.pular(posicaoEsperada());
      return;
    }
    if (agora() < ignorarAte.current || bloqueadoRef.current) return;
    // Aba escondida: quem pausou foi o celular/navegador, não a pessoa. Não avisa os outros.
    if (document.hidden) return;

    if (s === TOCANDO && !esperado.current.tocando) enviar(true);
    else if ((s === PAUSADO || s === FIM) && esperado.current.tocando) enviar(false);
  }

  // Confere a cada meio segundo se a pessoa pulou para outro ponto do vídeo
  // (os players não avisam isso de um jeito confiável) ou se ficou para trás por travar.
  function conferirPosicao() {
    const p = player.current;
    if (!p || agora() < ignorarAte.current || bloqueadoRef.current || document.hidden) return;
    const s = p.estado();
    if (s !== TOCANDO && s !== PAUSADO) return;

    const diferenca = p.tempo() - posicaoEsperada();

    // Depois de uma correção, ajusta a compensação com o que sobrou de diferença.
    if (corrigiu.current) {
      corrigiu.current = false;
      if (s === TOCANDO && Math.abs(diferenca) < PULO_MINIMO) {
        compensacao.current = Math.min(2, Math.max(0, compensacao.current - diferenca));
      }
    }

    if (Math.abs(diferenca) <= TOLERANCIA) {
      travada.current.duracao = 0;
      return;
    }

    // Ficou para trás porque a internet travou: corrige só aqui, sem puxar os outros.
    const atrasoDaTravada = travada.current.duracao;
    const foiTravada =
      esperado.current.tocando && diferenca < 0 && atrasoDaTravada > 0 && Math.abs(diferenca + atrasoDaTravada) < 2;

    // Diferença grande que não foi travada: foi a pessoa que pulou. Avisa os outros.
    if (Math.abs(diferenca) >= PULO_MINIMO && !foiTravada) {
      enviar(s === TOCANDO);
      return;
    }

    // Diferença pequena (atraso para começar a tocar, travada): corrige só aqui.
    if (agora() < proximaCorrecao.current) return;
    travada.current.duracao = 0;
    proximaCorrecao.current = agora() + INTERVALO_CORRECAO_MS;
    ignorarAte.current = agora() + IGNORAR_MS;
    corrigiu.current = true;
    p.pular(posicaoEsperada() + (s === TOCANDO ? compensacao.current : 0));
  }

  // Cria o player da plataforma certa.
  useEffect(() => {
    let cancelado = false;
    let criado = null;
    const criar = CRIADORES[video.tipo];

    criar(caixa.current, video, {
      aoPronto: () => {},
      aoMudarEstado: (s) => aoMudarEstado(s),
      aoErro: (msg) => !cancelado && setErro(msg),
    })
      .then((adaptador) => {
        criado = adaptador;
        if (cancelado || !adaptador) return adaptador?.destruir();
        player.current = adaptador;
        if (pendente.current) aplicar(pendente.current);
        pendente.current = null;
        pedirEstado();
      })
      .catch(() => !cancelado && setErro('Não foi possível carregar o player. Verifique a internet.'));

    const aoSincronizar = (estado) => {
      if (estado.versao !== video.versao) return;
      aplicar(estado);
      aoAcaoRemotaRef.current?.(estado);
    };
    // Se a conexão caiu e voltou, pega o estado de novo (depois de reentrar na sala).
    const aoReconectar = () => setTimeout(pedirEstado, 500);
    // No celular, a aba em segundo plano para de rodar: ao voltar, alcança os outros.
    const aoVoltarParaAba = () => document.visibilityState === 'visible' && pedirEstado();
    document.addEventListener('visibilitychange', aoVoltarParaAba);
    const intervalo = setInterval(conferirPosicao, 500);

    socket.on('video:sincronizar', aoSincronizar);
    socket.on('connect', aoReconectar);
    return () => {
      cancelado = true;
      clearInterval(intervalo);
      socket.off('video:sincronizar', aoSincronizar);
      socket.off('connect', aoReconectar);
      document.removeEventListener('visibilitychange', aoVoltarParaAba);
      criado?.destruir();
      player.current = null;
    };
  }, []);

  // Toque da pessoa para liberar o play que o navegador bloqueou.
  // Botão "Tocar" do aviso. Funciona no YouTube e no Vimeo; a Twitch só aceita o play clicado
  // dentro do player dela (por isso o aviso fica fora do vídeo, sem cobrir nada).
  function liberarPlay() {
    if (!player.current) return;
    setBloqueado(false);
    ignorarAte.current = agora() + IGNORAR_MS;
    player.current.pular(posicaoEsperada());
    player.current.tocar();
    verificarBloqueio();
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {bloqueado && !erro && (
        <div className="flex items-center gap-3 rounded-xl border border-yellow-900 bg-yellow-950 px-3 py-2 text-sm text-yellow-100">
          <span className="flex-1">
            O vídeo já está tocando para os outros. <b>Clique no play do vídeo</b> para entrar junto.
          </span>
          <button className="botao-principal shrink-0 py-1.5 text-sm" onClick={liberarPlay}>
            Tocar
          </button>
        </div>
      )}
      <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-2xl bg-black">
        <div ref={caixa} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
        {erro && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center">
            <p className="max-w-sm text-neutral-300">{erro}</p>
          </div>
        )}
      </div>
    </div>
  );
}
