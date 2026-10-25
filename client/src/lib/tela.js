// Opções da transmissão de tela e captura com getDisplayMedia.

export const RESOLUCOES = {
  '720p': { nome: '720p (HD)', largura: 1280, altura: 720 },
  '1080p': { nome: '1080p (Full HD)', largura: 1920, altura: 1080 },
  '1440p': { nome: '1440p (2K)', largura: 2560, altura: 1440 },
  '2160p': { nome: '2160p (4K)', largura: 3840, altura: 2160 },
};

export const FPS = [15, 30, 60];

// Taxa de bits em Mbps. "auto" escolhe pela resolução e fps.
export const BITRATES = ['auto', 2.5, 5, 8, 12, 20, 40];

const BITRATE_AUTO = {
  '720p': { 15: 1.5, 30: 2.5, 60: 4 },
  '1080p': { 15: 3, 30: 5, 60: 8 },
  '1440p': { 15: 6, 30: 10, 60: 16 },
  '2160p': { 15: 12, 30: 20, 60: 30 },
};

export const CONTEUDOS = {
  filme: {
    nome: 'Filme / jogo',
    descricao: 'Prioriza movimento suave. Se a rede apertar, baixa a nitidez e mantém o fps.',
    dica: 'motion',
    prioridade: 'maintain-framerate',
  },
  texto: {
    nome: 'Texto / slides',
    descricao: 'Prioriza nitidez. Se a rede apertar, baixa o fps e mantém tudo legível.',
    dica: 'detail',
    prioridade: 'maintain-resolution',
  },
};

export const OPCOES_PADRAO = {
  resolucao: '1080p',
  fps: 30,
  bitrate: 'auto',
  conteudo: 'filme',
  audio: true,
};

const CHAVE = 'yuyu:opcoesTela';

export function lerOpcoes() {
  try {
    return { ...OPCOES_PADRAO, ...JSON.parse(localStorage.getItem(CHAVE) || '{}') };
  } catch {
    return { ...OPCOES_PADRAO };
  }
}

export function salvarOpcoes(opcoes) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(opcoes));
  } catch {
    // Sem armazenamento: só não lembra da próxima vez.
  }
}

export function bitrateEmMbps(opcoes) {
  return opcoes.bitrate === 'auto' ? BITRATE_AUTO[opcoes.resolucao][opcoes.fps] : opcoes.bitrate;
}

// O que vai para o envio (Conexao.ajustarFaixa).
export function ajustesDeEnvio(opcoes) {
  return {
    bitrate: bitrateEmMbps(opcoes) * 1_000_000,
    fps: opcoes.fps,
    prioridade: CONTEUDOS[opcoes.conteudo].prioridade,
  };
}

function restricoesVideo(opcoes) {
  const r = RESOLUCOES[opcoes.resolucao];
  return {
    width: { ideal: r.largura, max: r.largura },
    height: { ideal: r.altura, max: r.altura },
    frameRate: { ideal: opcoes.fps, max: opcoes.fps },
  };
}

// Abre a janela do navegador para escolher tela inteira, janela ou aba.
export async function capturarTela(opcoes) {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: restricoesVideo(opcoes),
    // Áudio da tela/aba sem os filtros de voz, para não estragar música e filmes.
    audio: opcoes.audio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 }
      : false,
    systemAudio: opcoes.audio ? 'include' : 'exclude',
    selfBrowserSurface: 'exclude', // não oferece a própria aba do site (evita o efeito "espelho infinito")
    surfaceSwitching: 'include',
  });
  const video = stream.getVideoTracks()[0];
  if (video) video.contentHint = CONTEUDOS[opcoes.conteudo].dica;
  return stream;
}

// Aplica nova resolução/fps numa captura que já está rolando.
export async function ajustarCaptura(stream, opcoes) {
  const video = stream.getVideoTracks()[0];
  if (!video) return;
  video.contentHint = CONTEUDOS[opcoes.conteudo].dica;
  await video.applyConstraints(restricoesVideo(opcoes)).catch(() => {});
}
