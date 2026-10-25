import { ESTADOS, carregarScript, criarAlvo } from './comum.js';

// Player oficial do Vimeo (Player SDK). A API dele responde com Promises, então este adaptador
// guarda o último tempo/estado que o player avisou e calcula o tempo atual a partir dele.
export async function criarPlayerVimeo(caixa, video, { aoPronto, aoMudarEstado, aoErro }) {
  await carregarScript('https://player.vimeo.com/api/player.js', () => Boolean(window.Vimeo?.Player));

  const opcoes = video.hash
    ? { url: `https://vimeo.com/${video.id}/${video.hash}` }
    : { id: Number(video.id) };
  const alvo = criarAlvo(caixa);
  const player = new window.Vimeo.Player(alvo, { ...opcoes, playsinline: true, dnt: true });

  let estado = ESTADOS.PARADO;
  let ultimo = { segundos: video.inicio || 0, em: performance.now() };

  const tempoAtual = () =>
    estado === ESTADOS.TOCANDO ? ultimo.segundos + (performance.now() - ultimo.em) / 1000 : ultimo.segundos;
  const marcarTempo = (segundos) => (ultimo = { segundos, em: performance.now() });
  const mudar = (novo) => {
    if (novo === estado) return;
    // O relógio só anda tocando: congela o tempo ao parar e recomeça a contar ao tocar.
    marcarTempo(tempoAtual());
    estado = novo;
    aoMudarEstado(novo);
  };

  player.on('timeupdate', (d) => marcarTempo(d.seconds));
  player.on('seeked', (d) => marcarTempo(d.seconds));
  player.on('play', () => mudar(ESTADOS.TOCANDO));
  player.on('playing', () => mudar(ESTADOS.TOCANDO));
  player.on('pause', () => mudar(ESTADOS.PAUSADO));
  player.on('bufferstart', () => mudar(ESTADOS.CARREGANDO));
  player.on('bufferend', () => estado === ESTADOS.CARREGANDO && mudar(ESTADOS.TOCANDO));
  player.on('ended', () => mudar(ESTADOS.FIM));
  player.on('error', (e) =>
    aoErro(
      e?.name === 'PrivacyError' || e?.name === 'PasswordError'
        ? 'Esse vídeo do Vimeo é privado ou tem senha.'
        : 'Não foi possível tocar esse vídeo do Vimeo.',
    ),
  );

  try {
    await player.ready();
  } catch {
    aoErro('Esse vídeo do Vimeo não existe, é privado ou não pode ser tocado fora do Vimeo.');
    player.destroy().catch(() => {}).finally(() => alvo.remove());
    return null;
  }
  if (video.inicio) await player.setCurrentTime(video.inicio).catch(() => {});
  aoPronto();

  // Confere o tempo de verdade a cada segundo (os avisos de tempo do Vimeo podem atrasar ou parar,
  // por exemplo com a aba em segundo plano).
  const conferir = setInterval(() => {
    player.getCurrentTime().then(marcarTempo).catch(() => {});
  }, 1000);

  return {
    tempo: tempoAtual,
    estado: () => estado,
    // O navegador pode recusar o play automático: aí o estado não muda e a sala oferece o toque.
    tocar: () => player.play().catch(() => {}),
    pausar: () => player.pause().catch(() => {}),
    pular: (s) => {
      marcarTempo(s);
      player.setCurrentTime(s).catch(() => {});
    },
    destruir: () => {
      clearInterval(conferir);
      player.destroy().catch(() => {}).finally(() => alvo.remove());
    },
  };
}
