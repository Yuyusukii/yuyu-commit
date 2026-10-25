// Teste de carga do servidor: várias salas cheias, com sincronização e sinais de chamada
// acontecendo o tempo todo. Mede a memória do processo do servidor antes, durante e depois.
// Uso (com o site rodando): npm run teste:desempenho
import { io } from 'socket.io-client';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const URL = process.env.URL_TESTE || 'http://localhost:3000';
const SALAS = Number(process.env.SALAS || 6);
const POR_SALA = 8;
const SEGUNDOS = Number(process.env.SEGUNDOS || 60);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const novoId = () => crypto.randomBytes(16).toString('hex');

// Memória (MB) do processo "node server/index.js", lida pelo Windows.
function memoriaServidor() {
  try {
    const saida = execSync(
      'powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq \'node.exe\' -and $_.CommandLine -match \'server/index.js\' } | Select-Object -First 1).WorkingSetSize"',
      { encoding: 'utf8' },
    ).trim();
    return Math.round(Number(saida) / 1024 / 1024);
  } catch {
    return NaN;
  }
}

function conectar() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}
const pedir = (s, ev, d) => new Promise((r) => s.emit(ev, d, r));

const medidas = [];
const medir = (rotulo) => {
  const mb = memoriaServidor();
  medidas.push([rotulo, mb]);
  console.log(`  ${rotulo.padEnd(34)} ${mb} MB`);
};

console.log(`\nCarga: ${SALAS} salas x ${POR_SALA} pessoas, ${SEGUNDOS} s\n`);
medir('servidor parado');

const sockets = [];
const salas = [];
for (let i = 0; i < SALAS; i++) {
  const dono = await conectar();
  const clientId = novoId();
  // Cada conexão só pode criar 5 salas seguidas, então cada sala usa um "dono" novo.
  const { id } = await pedir(dono, 'sala:criar', { clientId });
  const membros = [{ s: dono, clientId }];
  for (let j = 1; j < POR_SALA; j++) membros.push({ s: await conectar(), clientId: novoId() });
  for (const [k, m] of membros.entries()) {
    const r = await pedir(m.s, 'sala:entrar', { salaId: id, clientId: m.clientId, apelido: `P${k}` });
    m.eu = r.eu;
  }
  await pedir(dono, 'video:definir', { link: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
  salas.push({ id, membros });
  sockets.push(...membros.map((m) => m.s));
}
await esperar(1000);
medir(`${SALAS * POR_SALA} pessoas conectadas`);

// Atividade: play/pausa a cada 2 s, sinais de chamada entre todos a cada 1 s, mic liga/desliga.
let mensagens = 0;
for (const s of sockets) s.onAny(() => mensagens++);
const fim = Date.now() + SEGUNDOS * 1000;
let tocando = false;
let passo = 0;
while (Date.now() < fim) {
  passo++;
  for (const sala of salas) {
    const [dono, ...resto] = sala.membros;
    if (passo % 2 === 0) {
      const { versao } = await pedir(dono.s, 'video:estado');
      tocando = !tocando;
      dono.s.emit('video:controle', { versao, tocando, tempo: passo });
    }
    for (const a of sala.membros) {
      for (const b of sala.membros) {
        if (a !== b) a.s.emit('rtc:sinal', { para: b.eu, dados: { candidato: { candidate: 'x'.repeat(200) } } });
      }
    }
    resto[passo % resto.length].s.emit('sala:mic', passo % 2 === 0);
  }
  if (passo % 15 === 0) medir(`durante a carga (${passo} s)`);
  await esperar(1000);
}
medir('fim da carga');
console.log(`\n  mensagens recebidas pelos clientes: ${mensagens}`);

for (const s of sockets) s.close();
await esperar(3000);
medir('todos saíram (3 s depois)');
process.exit(0);
