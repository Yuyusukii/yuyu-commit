import { ESTADOS, criarAlvo } from './comum.js';

// Carrega a API oficial do player do YouTube (IFrame Player API) uma vez só.
let carregando;
function carregarApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  carregando ??= new Promise((resolve) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      anterior?.();
      resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(script);
  });
  return carregando;
}

// Códigos de erro do player: https://developers.google.com/youtube/iframe_api_reference#onError
const ERROS = {
  2: 'O link desse vídeo parece estar errado.',
  5: 'Esse vídeo não pode ser tocado aqui.',
  100: 'Esse vídeo não existe mais ou é privado.',
  101: 'O dono desse vídeo não deixa ele ser tocado fora do YouTube.',
  150: 'O dono desse vídeo não deixa ele ser tocado fora do YouTube.',
};

const MAPA = { 1: ESTADOS.TOCANDO, 2: ESTADOS.PAUSADO, 3: ESTADOS.CARREGANDO, 0: ESTADOS.FIM };

export async function criarPlayerYoutube(caixa, video, { aoPronto, aoMudarEstado, aoErro }) {
  const YT = await carregarApi();
  let player;
  await new Promise((resolve) => {
    player = new YT.Player(criarAlvo(caixa), {
      width: '100%',
      height: '100%',
      videoId: video.id,
      playerVars: { start: video.inicio, rel: 0, playsinline: 1 },
      events: {
        onReady: resolve,
        onStateChange: (e) => aoMudarEstado(MAPA[e.data] ?? ESTADOS.PARADO),
        onError: (e) => aoErro(ERROS[e.data] ?? 'Não foi possível tocar esse vídeo.'),
      },
    });
  });
  aoPronto();
  return {
    tempo: () => player.getCurrentTime(),
    estado: () => MAPA[player.getPlayerState()] ?? ESTADOS.PARADO,
    tocar: () => player.playVideo(),
    pausar: () => player.pauseVideo(),
    pular: (s) => player.seekTo(s, true),
    destruir: () => player.destroy(),
  };
}
