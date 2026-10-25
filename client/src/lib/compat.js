// O que este navegador consegue fazer. Usado para avisar a pessoa em vez de falhar calado.

// O visual usa cores e recursos de CSS de 2023 em diante (iPhone com iOS 16.4+, Chrome 111+, Firefox 128+).
const cssModerno = typeof CSS !== 'undefined' && CSS.supports?.('color', 'oklch(50% 0.1 200)');
const temWebRTC = typeof RTCPeerConnection === 'function';

export const navegadorDesatualizado = !cssModerno || !temWebRTC;

// O Firefox transmite a tela, mas sem o áudio do PC (limitação dele).
export const ehFirefox = /Firefox\//.test(navigator.userAgent);
