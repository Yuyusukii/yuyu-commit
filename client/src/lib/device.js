// Celular não consegue transmitir a tela: os navegadores móveis não têm getDisplayMedia.
// Por isso a regra é "pode transmitir se o navegador oferece a API e não é um aparelho móvel".
const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const podeTransmitirTela =
  !isMobileUA && typeof navigator.mediaDevices?.getDisplayMedia === 'function';

export const ehCelular = isMobileUA;
