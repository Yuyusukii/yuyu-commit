// Reconhece links de vídeo das plataformas que têm player oficial com controle:
// YouTube, Vimeo e Twitch (lives e vídeos gravados). Netflix, Prime e afins não oferecem isso.
//
// Resultado: { tipo, id, inicio, hash? }
//   tipo: 'youtube' | 'vimeo' | 'twitch-video' | 'twitch-live'
//   inicio: segundo inicial (links com ?t=...)
//   hash: código de vídeo "não listado" do Vimeo

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;
const ID_NUMERICO = /^\d{1,12}$/;
const HASH_VIMEO = /^[0-9a-f]{6,20}$/i;
const CANAL_TWITCH = /^[A-Za-z0-9_]{3,25}$/;
// Páginas da Twitch que não são canais.
const PAGINAS_TWITCH = new Set(['directory', 'videos', 'settings', 'search', 'downloads', 'jobs', 'p', 'turbo', 'subscriptions', 'inventory', 'wallet', 'drops', 'friends', 'messages']);

// "90", "1h2m3s", "1m30s", "45s"
function lerTempo(valor) {
  if (!valor) return 0;
  if (/^\d+$/.test(valor)) return Number(valor);
  const m = valor.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  return m ? Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0) : 0;
}

function youtube(url, host) {
  let id = null;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).split('/')[0];
  } else if (url.pathname === '/watch') {
    id = url.searchParams.get('v');
  } else {
    id = url.pathname.match(/^\/(?:shorts|embed|live|v)\/([^/]+)/)?.[1];
  }
  if (!id || !ID_YOUTUBE.test(id)) return null;
  return { tipo: 'youtube', id, inicio: lerTempo(url.searchParams.get('t') || url.searchParams.get('start')) };
}

function vimeo(url, host) {
  const partes = url.pathname.split('/').filter(Boolean);
  let id = null;
  let hash = url.searchParams.get('h');
  if (host === 'player.vimeo.com') {
    if (partes[0] === 'video') id = partes[1];
  } else {
    // vimeo.com/123, vimeo.com/123/abcdef (não listado), vimeo.com/channels/x/123, vimeo.com/groups/x/videos/123
    const i = partes.findIndex((p) => ID_NUMERICO.test(p));
    if (i >= 0) {
      id = partes[i];
      if (!hash && partes[i + 1] && HASH_VIMEO.test(partes[i + 1])) hash = partes[i + 1];
    }
  }
  if (!id || !ID_NUMERICO.test(id)) return null;
  const tempo = url.hash.match(/t=([\dhms]+)/)?.[1];
  return { tipo: 'vimeo', id, inicio: lerTempo(tempo), ...(hash && HASH_VIMEO.test(hash) ? { hash } : {}) };
}

function twitch(url) {
  const partes = url.pathname.split('/').filter(Boolean);
  if (partes[0] === 'videos' && ID_NUMERICO.test(partes[1] ?? '')) {
    return { tipo: 'twitch-video', id: partes[1], inicio: lerTempo(url.searchParams.get('t')) };
  }
  if (partes.length === 1 && CANAL_TWITCH.test(partes[0]) && !PAGINAS_TWITCH.has(partes[0].toLowerCase())) {
    return { tipo: 'twitch-live', id: partes[0].toLowerCase(), inicio: 0 };
  }
  return null;
}

export function lerLinkVideo(texto) {
  let url;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '');

  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') return youtube(url, host);
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return vimeo(url, host);
  if (host === 'twitch.tv') return twitch(url);
  return null;
}
