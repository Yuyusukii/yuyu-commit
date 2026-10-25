import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {
  criarSala,
  obterSala,
  entrarNaSala,
  sairDaSala,
  ehCriador,
  expulsar,
  estadoPublico,
  definirVideo,
  removerVideo,
  controlarReproducao,
  reproducaoPublica,
} from './salas.js';
import { ipNaRede } from './rede.js';
import { lerLinkVideo } from './videos.js';
import { iniciarTunel, linkDoTunel } from './tunel.js';
import { cabecalhosSeguranca, criarLimitador } from './seguranca.js';

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '..', 'dist');

// Um erro inesperado em uma sala não deve derrubar o site para todo mundo: registra e segue.
process.on('uncaughtException', (erro) => console.error('[erro inesperado]', erro));
process.on('unhandledRejection', (erro) => console.error('[erro inesperado]', erro));

const app = express();
app.disable('x-powered-by');
app.use(cabecalhosSeguranca);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  // Mensagens grandes não têm motivo de existir aqui (a maior, uma descrição WebRTC, tem ~10 KB).
  maxHttpBufferSize: 64 * 1024,
});

function enderecoNaRede() {
  const ip = ipNaRede();
  return ip ? `http://${ip}:${PORT}` : null;
}

// Endereço que vai nos links de convite, do melhor para o mais limitado:
// LINK_PUBLICO (configurado à mão) > túnel https > IP no Wi-Fi.
function enderecoConvite() {
  if (process.env.LINK_PUBLICO) return process.env.LINK_PUBLICO.replace(/\/+$/, '');
  return linkDoTunel() ?? enderecoNaRede();
}

app.get('/api/status', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/endereco', (_req, res) => {
  res.json({ base: enderecoConvite() });
});

// Servidores que ajudam duas pessoas a se encontrarem na internet para a chamada.
// STUN (grátis) resolve a maioria dos casos. TURN é para redes muito fechadas e precisa
// de um serviço próprio: configure TURN_URL, TURN_USUARIO e TURN_SENHA se tiver um.
app.get('/api/ice', (_req, res) => {
  const servidores = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  ];
  if (process.env.TURN_URL) {
    servidores.push({
      urls: process.env.TURN_URL.split(','),
      username: process.env.TURN_USUARIO,
      credential: process.env.TURN_SENHA,
    });
  }
  res.json(servidores);
});

// Entrega o site já compilado (npm run build).
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // Qualquer outra rota (ex.: /sala/abc123) cai no app React.
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Rode "npm run build" antes de iniciar.'));
}

// Texto vindo do navegador: só string, sem caracteres invisíveis/de controle, com tamanho máximo.
const texto = (v, max) =>
  typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}]/gu, '').trim().slice(0, max) : '';
// Identificação da aba: 32 caracteres hexadecimais gerados no navegador.
const idDeAba = (v) => (typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : null);

io.on('connection', (socket) => {
  let salaAtual = null;

  // Limite de ações por conexão: o que passar do limite é ignorado (com resposta, se pedirem).
  const permitir = criarLimitador();
  socket.use(([evento, ...args], next) => {
    if (permitir(evento)) return next();
    const responder = args.at(-1);
    if (typeof responder === 'function') responder({ erro: 'devagar' });
  });

  function avisarSala() {
    io.to(salaAtual.id).emit('sala:estado', estadoPublico(salaAtual));
  }

  const meuApelido = () => salaAtual?.participantes.get(socket.id)?.apelido ?? '';

  function sair() {
    if (!salaAtual) return;
    sairDaSala(salaAtual, socket.id);
    socket.leave(salaAtual.id);
    avisarSala();
    salaAtual = null;
  }

  // Usado quando o criador remove esta pessoa (o servidor já tirou ela da lista).
  socket.data.serExpulso = () => {
    if (!salaAtual) return;
    socket.leave(salaAtual.id);
    salaAtual = null;
    socket.emit('sala:expulso');
  };

  socket.on('sala:criar', (dados, responder) => {
    if (typeof responder !== 'function') return;
    const clientId = idDeAba(dados?.clientId);
    if (!clientId) return responder({ erro: 'invalido' });
    const sala = criarSala(clientId);
    if (!sala) return responder({ erro: 'lotado' });
    console.log(`[sala] ${sala.id} criada`);
    responder({ id: sala.id });
  });

  socket.on('sala:entrar', (dados, responder) => {
    if (typeof responder !== 'function') return;
    const sala = obterSala(texto(dados?.salaId, 32));
    if (!sala) return responder({ erro: 'nao-existe' });
    const clientId = idDeAba(dados?.clientId);
    if (!clientId) return responder({ erro: 'invalido' });

    sair();
    const resultado = entrarNaSala(sala, {
      socketId: socket.id,
      clientId,
      apelido: texto(dados?.apelido, 24),
      celular: Boolean(dados?.celular),
    });
    if (resultado.erro) return responder(resultado);

    salaAtual = sala;
    socket.join(sala.id);
    responder({ ok: true, eu: socket.id });
    avisarSala();
  });

  socket.on('sala:expulsar', (alvoId) => {
    if (!salaAtual || !ehCriador(salaAtual, socket.id) || typeof alvoId !== 'string') return;
    if (!expulsar(salaAtual, alvoId)) return;
    io.sockets.sockets.get(alvoId)?.data.serExpulso?.();
    avisarSala();
  });

  socket.on('sala:bloquear', (bloquear) => {
    if (!salaAtual || !ehCriador(salaAtual, socket.id)) return;
    salaAtual.bloqueada = Boolean(bloquear);
    avisarSala();
  });

  socket.on('video:definir', (dados, responder) => {
    if (typeof responder !== 'function') return;
    if (!salaAtual) return responder({ erro: 'fora-da-sala' });
    const video = lerLinkVideo(texto(dados?.link, 500));
    if (!video) return responder({ erro: 'link-invalido' });
    definirVideo(salaAtual, video, meuApelido());
    responder({ ok: true });
    avisarSala();
  });

  socket.on('video:remover', () => {
    if (!salaAtual) return;
    removerVideo(salaAtual);
    avisarSala();
  });

  // Quem acabou de abrir o player pergunta onde o vídeo está.
  socket.on('video:estado', (_dados, responder) => {
    if (typeof responder !== 'function' || !salaAtual) return;
    responder(reproducaoPublica(salaAtual));
  });

  // Play, pausa ou pulo: guarda e repassa para os outros da sala.
  socket.on('video:controle', (dados) => {
    if (!salaAtual?.video || dados?.versao !== salaAtual.video.versao) return;
    const tempo = dados.tempo;
    if (typeof tempo !== 'number' || !Number.isFinite(tempo) || tempo < 0 || tempo > 1e6) return;
    controlarReproducao(salaAtual, { tocando: Boolean(dados.tocando), tempo }, meuApelido());
    socket.to(salaAtual.id).emit('video:sincronizar', reproducaoPublica(salaAtual));
  });

  // Chamada (WebRTC): o servidor só repassa os "sinais" para combinar a conexão entre duas
  // pessoas da mesma sala. O áudio vai direto de uma pessoa para a outra, sem passar por aqui.
  socket.on('rtc:sinal', (dados) => {
    if (!salaAtual || typeof dados?.para !== 'string' || dados.para === socket.id) return;
    if (!salaAtual.participantes.has(dados.para)) return;
    // Uma descrição de conexão tem poucos KB; nada maior que isso é repassado.
    if (JSON.stringify(dados.dados ?? null).length > 32 * 1024) return;
    io.to(dados.para).emit('rtc:sinal', { de: socket.id, dados: dados.dados });
  });

  // Transmissão de tela: uma pessoa por vez.
  socket.on('tela:iniciar', (_dados, responder) => {
    if (typeof responder !== 'function') return;
    if (!salaAtual) return responder({ erro: 'fora-da-sala' });
    const atual = salaAtual.transmissao;
    if (atual && atual.por !== socket.id) return responder({ erro: 'ocupado', apelido: atual.apelido });
    salaAtual.transmissao = { por: socket.id, apelido: meuApelido() };
    // A tela ocupa o palco: pausa o YouTube para todos, para os sons não se misturarem.
    if (salaAtual.video && salaAtual.reproducao.tocando) {
      const { tempo } = reproducaoPublica(salaAtual);
      controlarReproducao(salaAtual, { tocando: false, tempo }, meuApelido());
      io.to(salaAtual.id).emit('video:sincronizar', reproducaoPublica(salaAtual));
    }
    responder({ ok: true });
    avisarSala();
  });

  socket.on('tela:parar', () => {
    if (salaAtual?.transmissao?.por !== socket.id) return;
    salaAtual.transmissao = null;
    avisarSala();
  });

  socket.on('sala:mic', (ligado) => {
    const eu = salaAtual?.participantes.get(socket.id);
    if (!eu) return;
    eu.mic = Boolean(ligado);
    avisarSala();
  });

  socket.on('sala:sair', sair);
  socket.on('disconnect', sair);
});

httpServer.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`\n  A porta ${PORT} já está em uso: o Yuyu Commit provavelmente já está aberto em outra janela.`);
    console.error('  Feche a outra janela (ou use ela) e tente de novo.\n');
  } else {
    console.error('\n  Não foi possível iniciar o servidor:', erro.message, '\n');
  }
  process.exit(1);
});

httpServer.listen(PORT, () => {
  const naRede = enderecoNaRede();
  console.log('');
  console.log('  Yuyu Commit está rodando!');
  console.log('');
  console.log(`  Neste PC:            http://localhost:${PORT}`);
  console.log(`  Mesmo Wi-Fi:         ${naRede ?? 'não achei este PC em nenhuma rede Wi-Fi/cabo'}`);
  if (process.env.LINK_PUBLICO) {
    console.log(`  Link público:        ${enderecoConvite()}`);
  }

  const tunel =
    !process.env.LINK_PUBLICO &&
    iniciarTunel(PORT, (link) => {
      console.log('');
      console.log(`  Link https pronto:   ${link}`);
      console.log('  (funciona de qualquer lugar e libera o microfone no celular; muda a cada vez que o site inicia)');
      console.log('');
    });
  if (tunel === 'abrindo') {
    console.log('  Link https:          abrindo o túnel, aguarde alguns segundos...');
  } else if (tunel === 'desligado') {
    console.log('  Link https:          desligado (SEM_TUNEL).');
  } else if (tunel === 'sem-programa') {
    console.log('  Link https:          desligado (cloudflared não encontrado). Sem ele, os convites só');
    console.log('                       funcionam no mesmo Wi-Fi e o microfone não funciona no celular.');
  }
  console.log('');
  console.log('  Deixe esta janela aberta enquanto estiverem usando. Para desligar, feche-a.');
  console.log('');
});
