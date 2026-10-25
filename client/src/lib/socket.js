import { io } from 'socket.io-client';

// Uma única conexão com o servidor para o site inteiro.
export const socket = io();

// Identifica esta aba para o servidor, sem conta: serve para reconhecer quem criou a sala
// e para deixar a pessoa voltar se a conexão cair. Cada aba é uma pessoa diferente.
function gerarClientId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function lerClientId() {
  try {
    let id = sessionStorage.getItem('yuyu:clientId');
    if (!id) {
      id = gerarClientId();
      sessionStorage.setItem('yuyu:clientId', id);
    }
    return id;
  } catch {
    return gerarClientId();
  }
}

export const clientId = lerClientId();

// Versão com Promise do "emit com resposta" do Socket.IO.
export function pedir(evento, dados) {
  return new Promise((resolve) => socket.emit(evento, dados, resolve));
}
