import crypto from 'node:crypto';

// As salas vivem só na memória do servidor: sem banco de dados e sem contas.
// Se o servidor for desligado, as salas somem junto.

const MAX_PARTICIPANTES = 8;
const MAX_SALAS = 300; // um PC de casa não precisa de mais que isso; barra criação em massa
const TEMPO_SALA_VAZIA_MS = 5 * 60 * 1000; // sala sem ninguém fecha após 5 minutos

const salas = new Map();

// Código aleatório e difícil de adivinhar (10 caracteres, letras minúsculas e números).
function gerarIdSala() {
  const alfabeto = 'abcdefghijkmnpqrstuvwxyz23456789'; // sem l, o, 0, 1 para não confundir
  let id;
  do {
    id = Array.from(crypto.randomBytes(10), (b) => alfabeto[b % alfabeto.length]).join('');
  } while (salas.has(id));
  return id;
}

export function criarSala(clientId) {
  if (salas.size >= MAX_SALAS) return null;
  const sala = {
    id: gerarIdSala(),
    criadorClientId: clientId,
    bloqueada: false,
    participantes: new Map(), // socketId -> participante
    jaEntraram: new Set(), // clientIds que já estiveram na sala (podem voltar mesmo bloqueada)
    expulsos: new Set(), // clientIds removidos pelo criador (não voltam com a mesma aba)
    vaziaDesde: Date.now(),
    contadorConvidados: 0,
    video: null, // { tipo, id, inicio, hash?, colocadoPor, versao } — ver videos.js
    versaoVideo: 0,
    // Play/pausa/tempo do vídeo. "tempo" é a posição no momento "em" (relógio do servidor).
    reproducao: { tocando: false, tempo: 0, em: Date.now(), por: '' },
    transmissao: null, // { por: socketId, apelido } — uma pessoa transmite a tela por vez
  };
  salas.set(sala.id, sala);
  return sala;
}

export function obterSala(id) {
  return salas.get(id);
}

export function entrarNaSala(sala, { socketId, clientId, apelido, celular }) {
  // Mesma pessoa reconectando (ex.: internet caiu): troca a conexão antiga pela nova.
  for (const [antigoSocketId, p] of sala.participantes) {
    if (p.clientId === clientId) sala.participantes.delete(antigoSocketId);
  }

  if (sala.expulsos.has(clientId)) {
    return { erro: 'expulso' };
  }
  if (sala.bloqueada && !sala.jaEntraram.has(clientId)) {
    return { erro: 'bloqueada' };
  }
  if (sala.participantes.size >= MAX_PARTICIPANTES) {
    return { erro: 'cheia' };
  }

  const nome = apelido || `Convidado ${++sala.contadorConvidados}`;
  sala.participantes.set(socketId, { id: socketId, clientId, apelido: nome, celular });
  sala.jaEntraram.add(clientId);
  sala.vaziaDesde = null;
  return { ok: true };
}

export function sairDaSala(sala, socketId) {
  sala.participantes.delete(socketId);
  if (sala.transmissao?.por === socketId) sala.transmissao = null;
  if (sala.participantes.size === 0) sala.vaziaDesde = Date.now();
}

// O criador tira alguém da sala. Devolve true se tirou.
export function expulsar(sala, socketId) {
  const alvo = sala.participantes.get(socketId);
  if (!alvo || alvo.clientId === sala.criadorClientId) return false;
  sala.expulsos.add(alvo.clientId);
  sala.jaEntraram.delete(alvo.clientId);
  sairDaSala(sala, socketId);
  return true;
}

export function ehCriador(sala, socketId) {
  return sala.participantes.get(socketId)?.clientId === sala.criadorClientId;
}

export function definirVideo(sala, video, apelido) {
  sala.video = { ...video, colocadoPor: apelido, versao: ++sala.versaoVideo };
  sala.reproducao = { tocando: false, tempo: video.inicio, em: Date.now(), por: '' };
}

export function removerVideo(sala) {
  sala.video = null;
}

// Alguém deu play, pausou ou pulou para outro ponto do vídeo.
export function controlarReproducao(sala, { tocando, tempo }, apelido) {
  sala.reproducao = { tocando, tempo, em: Date.now(), por: apelido };
}

// Onde o vídeo está agora, para mandar a todos.
export function reproducaoPublica(sala) {
  const r = sala.reproducao;
  const tempo = r.tocando ? r.tempo + (Date.now() - r.em) / 1000 : r.tempo;
  return { versao: sala.video?.versao ?? 0, tocando: r.tocando, tempo, por: r.por };
}

// O que todo mundo na sala recebe (sem expor o clientId de ninguém).
export function estadoPublico(sala) {
  return {
    id: sala.id,
    bloqueada: sala.bloqueada,
    video: sala.video,
    transmissao: sala.transmissao,
    participantes: [...sala.participantes.values()].map((p) => ({
      id: p.id,
      apelido: p.apelido,
      celular: p.celular,
      mic: Boolean(p.mic),
      criador: p.clientId === sala.criadorClientId,
    })),
  };
}

// Fecha salas abandonadas.
setInterval(() => {
  const agora = Date.now();
  for (const [id, sala] of salas) {
    if (sala.vaziaDesde && agora - sala.vaziaDesde > TEMPO_SALA_VAZIA_MS) {
      salas.delete(id);
      console.log(`[sala] ${id} fechada por estar vazia`);
    }
  }
}, 60 * 1000).unref();
