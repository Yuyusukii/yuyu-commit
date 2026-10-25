// Quantas vezes cada ação pode ser feita por conexão: [máximo de uma vez, recarga por segundo].
// Uso normal nunca chega perto; serve para barrar scripts de spam e de "chute" de códigos de sala.
const LIMITES = {
  'sala:criar': [5, 5 / 60], // 5 seguidas, depois 5 por minuto
  'sala:entrar': [10, 10 / 60], // impede testar códigos de sala no chute
  'video:definir': [10, 20 / 60],
  'video:controle': [20, 10],
  'video:estado': [20, 5],
  'rtc:sinal': [300, 100], // a conexão manda rajadas de candidatos ao conectar
  'sala:expulsar': [10, 10 / 60],
  padrao: [20, 10],
};

// Balde de fichas: cada ação gasta uma ficha; as fichas voltam aos poucos.
export function criarLimitador() {
  const baldes = new Map();
  return function permitir(evento) {
    const [maximo, recarga] = LIMITES[evento] ?? LIMITES.padrao;
    const agora = Date.now() / 1000;
    const b = baldes.get(evento) ?? { fichas: maximo, em: agora };
    b.fichas = Math.min(maximo, b.fichas + (agora - b.em) * recarga);
    b.em = agora;
    baldes.set(evento, b);
    if (b.fichas < 1) return false;
    b.fichas -= 1;
    return true;
  };
}

// Cabeçalhos de segurança para todas as respostas do site.
export function cabecalhosSeguranca(req, res, next) {
  const host = req.headers.host ?? '';
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // Scripts e players: só os do site e os players oficiais de YouTube, Vimeo e Twitch.
      "script-src 'self' https://www.youtube.com https://s.ytimg.com https://player.vimeo.com https://player.twitch.tv",
      'frame-src https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://player.twitch.tv https://embed.twitch.tv',
      "img-src 'self' data: https://i.ytimg.com",
      // Estilos inline: o React usa style={...} em alguns pontos (ex.: cor das bolinhas dos streamings).
      "style-src 'self' 'unsafe-inline'",
      // vimeo.com: o SDK do Vimeo consulta os dados do vídeo (oEmbed) antes de criar o player.
      `connect-src 'self' ws://${host} wss://${host} https://vimeo.com`,
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'", // ninguém pode embutir o site (evita golpes de clique)
    ].join('; '),
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // O YouTube exige saber de qual site vem o player; mais do que a origem não é enviado.
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // Microfone, câmera e captura de tela só para o próprio site (nunca para iframes de fora).
  res.setHeader(
    'Permissions-Policy',
    'microphone=(self), camera=(self), display-capture=(self), geolocation=(), payment=(), usb=()',
  );
  next();
}
