// O apelido fica salvo só neste navegador, para não precisar digitar de novo.
const CHAVE = 'yuyu:apelido';

export function lerApelido() {
  try {
    return localStorage.getItem(CHAVE) || '';
  } catch {
    return '';
  }
}

export function salvarApelido(apelido) {
  try {
    localStorage.setItem(CHAVE, apelido.trim());
  } catch {
    // Sem armazenamento (aba anônima etc.): segue sem lembrar.
  }
}
