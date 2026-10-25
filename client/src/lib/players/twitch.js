import { ESTADOS, carregarScript, criarAlvo } from './comum.js';

// A Twitch só deixa o player funcionar em https (ou no próprio PC, localhost).
export const twitchDisponivel = window.isSecureContext;

const carregarTwitch = () =>
  carregarScript('https://player.twitch.tv/js/embed/v1.js', () => Boolean(window.Twitch?.Player));

const formatarTempo = (s) => {
  const t = Math.floor(s || 0);
  return `${Math.floor(t / 3600)}h${Math.floor((t % 3600) / 60)}m${t % 60}s`;
};

// Vídeo gravado (VOD) da Twitch: dá para pausar e pular, então é sincronizado como o YouTube.
// O "parent" (domínio do site) é preenchido sozinho pelo script oficial.
export async function criarPlayerTwitchVideo(caixa, video, { aoPronto, aoMudarEstado }) {
  await carregarTwitch();
  const T = window.Twitch.Player;
  const alvo = criarAlvo(caixa);
  const player = new T(alvo, {
    video: video.id,
    time: formatarTempo(video.inicio),
    width: '100%',
    height: '100%',
    autoplay: false,
  });

  let estado = ESTADOS.PARADO;
  const mudar = (novo) => {
    if (novo === estado) return;
    estado = novo;
    aoMudarEstado(novo);
  };
  // PLAY = pediram para tocar (pode estar carregando, em anúncio ou bloqueado pelo navegador);
  // PLAYING = o vídeo está passando de fato.
  player.addEventListener(T.PLAY, () => estado !== ESTADOS.TOCANDO && mudar(ESTADOS.CARREGANDO));
  player.addEventListener(T.PLAYING, () => mudar(ESTADOS.TOCANDO));
  player.addEventListener(T.PAUSE, () => mudar(ESTADOS.PAUSADO));
  player.addEventListener(T.ENDED, () => mudar(ESTADOS.FIM));

  await new Promise((resolve) => player.addEventListener(T.READY, resolve));
  aoPronto();

  // Antes do primeiro play a Twitch informa o tempo como 0, mesmo com o vídeo parado em outro ponto
  // (ex.: link com ?t=10m). Até lá, vale o último ponto que este site pediu.
  let pontoPedido = video.inicio || 0;
  return {
    tempo: () => player.getCurrentTime() || pontoPedido,
    estado: () => estado,
    tocar: () => player.play(),
    pausar: () => player.pause(),
    pular: (s) => {
      pontoPedido = s;
      player.seek(s);
    },
    destruir: () => alvo.remove(),
  };
}

// Live da Twitch: não dá para pausar/pular (todo mundo já assiste ao vivo), então só mostra o canal.
export async function criarPlayerTwitchLive(caixa, canal) {
  await carregarTwitch();
  const alvo = criarAlvo(caixa);
  new window.Twitch.Player(alvo, {
    channel: canal,
    width: '100%',
    height: '100%',
    autoplay: true,
  });
  return { destruir: () => alvo.remove() };
}
