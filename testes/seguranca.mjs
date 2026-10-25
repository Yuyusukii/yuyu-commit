// Testa as defesas do servidor simulando um visitante mal-intencionado.
// Uso: com o site rodando, em outro terminal: npm run teste:seguranca
import { io } from 'socket.io-client';
import crypto from 'node:crypto';

const URL = process.env.URL_TESTE || 'http://localhost:3000';
let falhas = 0;

function checar(nome, ok, detalhe = '') {
  console.log(`${ok ? '  ok  ' : ' FALHOU'}  ${nome}${detalhe ? ` (${detalhe})` : ''}`);
  if (!ok) falhas++;
}

const novoId = () => crypto.randomBytes(16).toString('hex');
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function conectar() {
  return new Promise((resolve, reject) => {
    const s = io(URL, { transports: ['websocket'], reconnection: false, forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

const pedir = (s, evento, dados) =>
  Promise.race([
    new Promise((r) => s.emit(evento, dados, r)),
    esperar(2000).then(() => ({ semResposta: true })),
  ]);

// Espera um evento chegar (ou não) em até "ms".
const receber = (s, evento, ms = 800) =>
  Promise.race([new Promise((r) => s.once(evento, (d) => r(d ?? true))), esperar(ms).then(() => null)]);

async function entrarComo(apelido) {
  const s = await conectar();
  const clientId = novoId();
  return { s, clientId, apelido };
}

console.log(`\nTestando ${URL}\n`);

// 1. Cabeçalhos HTTP
{
  const r = await fetch(URL + '/');
  const csp = r.headers.get('content-security-policy') ?? '';
  checar('Política de conteúdo (CSP) presente', csp.includes("default-src 'self'"));
  checar('Site não pode ser embutido em outro', r.headers.get('x-frame-options') === 'DENY' && csp.includes("frame-ancestors 'none'"));
  checar('Não revela a tecnologia do servidor', !r.headers.get('x-powered-by'));
  checar('Permissões de mic/câmera/tela só para o site', (r.headers.get('permissions-policy') ?? '').includes('microphone=(self)'));
  const t = await fetch(URL + '/..%2fpackage.json').then((x) => x.text());
  checar('Não deixa ler arquivos do projeto pelo endereço', !t.includes('"dependencies"'));
}

// 2. Criar sala
const criador = await entrarComo('Dono');
let salaId;
{
  const semId = await pedir(criador.s, 'sala:criar', {});
  checar('Criar sala sem identificação é recusado', semId.erro === 'invalido');
  const r = await pedir(criador.s, 'sala:criar', { clientId: criador.clientId });
  salaId = r.id;
  checar('Criar sala normal funciona', typeof salaId === 'string' && salaId.length === 10);
  await pedir(criador.s, 'sala:entrar', { salaId, clientId: criador.clientId, apelido: 'Dono' });
}

// 3. Criação em massa
{
  const s = await conectar();
  const resultados = [];
  for (let i = 0; i < 12; i++) resultados.push(await pedir(s, 'sala:criar', { clientId: novoId() }));
  const barradas = resultados.filter((r) => r.erro === 'devagar').length;
  checar('Criação de salas em massa é barrada', barradas >= 6, `${12 - barradas} criadas, ${barradas} barradas`);
  s.close();
}

// 4. Chutar códigos de sala
{
  const s = await conectar();
  const resultados = [];
  for (let i = 0; i < 20; i++) {
    resultados.push(await pedir(s, 'sala:entrar', { salaId: crypto.randomBytes(5).toString('hex'), clientId: novoId() }));
  }
  const barradas = resultados.filter((r) => r.erro === 'devagar').length;
  checar('Tentativas de adivinhar códigos são barradas', barradas >= 8, `${barradas} de 20 barradas`);
  s.close();
}

// 5. Convidado mal-intencionado
const intruso = await entrarComo('Intruso');
{
  const apelidoSujo = 'Ev‮il\u0000' + 'x'.repeat(100);
  await pedir(intruso.s, 'sala:entrar', { salaId, clientId: intruso.clientId, apelido: apelidoSujo });
  const estado = await pedir(intruso.s, 'video:estado'); // só para sincronizar
  void estado;
  const lista = await new Promise((r) => {
    criador.s.once('sala:estado', r);
    intruso.s.emit('sala:mic', false); // força um novo estado
  });
  const nome = lista.participantes.find((p) => !p.criador)?.apelido ?? '';
  checar('Apelido limpo de caracteres invisíveis', !/[\u0000‮]/.test(nome), JSON.stringify(nome.slice(0, 12)));
  checar('Apelido com no máximo 24 caracteres', nome.length <= 24, `${nome.length}`);

  // Bloquear sem ser o criador
  intruso.s.emit('sala:bloquear', true);
  const depois = await receber(criador.s, 'sala:estado');
  checar('Só o criador bloqueia a sala', !depois || depois.bloqueada === false);

  // Remover o criador sem ser o criador
  const idCriador = lista.participantes.find((p) => p.criador)?.id;
  intruso.s.emit('sala:expulsar', idCriador);
  checar('Só o criador remove pessoas', !(await receber(criador.s, 'sala:expulso')));

  // Links perigosos
  const js = await pedir(intruso.s, 'video:definir', { link: 'javascript:alert(1)' });
  checar('Link "javascript:" recusado', js.erro === 'link-invalido');
  const obj = await pedir(intruso.s, 'video:definir', { link: { toString: 1 } });
  checar('Link que não é texto recusado', obj.erro === 'link-invalido');
  const imitacao = await pedir(intruso.s, 'video:definir', { link: 'https://vimeo.com.golpe.com/1084537' });
  checar('Site que imita o Vimeo recusado', imitacao.erro === 'link-invalido');
  const imitacao2 = await pedir(intruso.s, 'video:definir', { link: 'https://golpe.com/twitch.tv/canal' });
  checar('Site que imita a Twitch recusado', imitacao2.erro === 'link-invalido');
  const vimeo = await pedir(intruso.s, 'video:definir', { link: 'https://vimeo.com/1084537' });
  checar('Link do Vimeo aceito', vimeo.ok === true);
  const twitch = await pedir(intruso.s, 'video:definir', { link: 'https://www.twitch.tv/videos/2910618618' });
  checar('Link da Twitch aceito', twitch.ok === true);

  // Tempo de vídeo inválido
  await pedir(intruso.s, 'video:definir', { link: 'https://youtu.be/aqz-KE-bpKQ' });
  const versao = (await pedir(intruso.s, 'video:estado')).versao;
  for (const tempo of [NaN, -5, 'abc', Infinity, null]) intruso.s.emit('video:controle', { versao, tocando: true, tempo });
  await esperar(300);
  const rep = await pedir(intruso.s, 'video:estado');
  checar('Tempos de vídeo inválidos são ignorados', rep.tocando === false && rep.tempo === 0);

  // Mensagem de chamada grande demais
  intruso.s.emit('rtc:sinal', { para: idCriador, dados: { lixo: 'x'.repeat(40 * 1024) } });
  checar('Mensagem de chamada grande não é repassada', !(await receber(criador.s, 'rtc:sinal')));
  intruso.s.emit('rtc:sinal', { para: idCriador, dados: { candidato: null } });
  checar('Mensagem de chamada normal é repassada', Boolean(await receber(criador.s, 'rtc:sinal')));

  // Inundar de mensagens
  let recebidas = 0;
  const contar = () => recebidas++;
  criador.s.on('rtc:sinal', contar);
  for (let i = 0; i < 2000; i++) intruso.s.emit('rtc:sinal', { para: idCriador, dados: { candidato: null } });
  await esperar(1000);
  criador.s.off('rtc:sinal', contar);
  checar('Inundação de mensagens é limitada', recebidas < 600, `${recebidas} de 2000 repassadas`);

  // Pedaço gigante (passa do limite do Socket.IO): a conexão é derrubada
  const caiu = receber(intruso.s, 'disconnect', 2000);
  intruso.s.emit('sala:mic', 'x'.repeat(200 * 1024));
  checar('Mensagem gigante derruba quem mandou', Boolean(await caiu));
}

// 6. Transmissão: um por vez
{
  const a = await entrarComo('A');
  const b = await entrarComo('B');
  await pedir(a.s, 'sala:entrar', { salaId, clientId: a.clientId, apelido: 'A' });
  await pedir(b.s, 'sala:entrar', { salaId, clientId: b.clientId, apelido: 'B' });
  await pedir(a.s, 'tela:iniciar');
  const r = await pedir(b.s, 'tela:iniciar');
  checar('Segunda pessoa não rouba a transmissão', r.erro === 'ocupado');
  b.s.emit('tela:parar');
  const estado = await receber(criador.s, 'sala:estado', 500);
  checar('Outra pessoa não encerra a transmissão alheia', !estado || estado.transmissao?.apelido === 'A');

  // 7. Remover alguém
  const lista = await new Promise((res) => {
    criador.s.once('sala:estado', res);
    b.s.emit('sala:mic', false);
  });
  const idB = lista.participantes.find((p) => p.apelido === 'B').id;
  const aviso = receber(b.s, 'sala:expulso');
  criador.s.emit('sala:expulsar', idB);
  checar('Criador consegue remover alguém', Boolean(await aviso));
  const volta = await pedir(b.s, 'sala:entrar', { salaId, clientId: b.clientId, apelido: 'B' });
  checar('Pessoa removida não volta com a mesma aba', volta.erro === 'expulso');
  a.s.close();
  b.s.close();
}

criador.s.close();
console.log(falhas ? `\n${falhas} teste(s) falharam.\n` : '\nTodos os testes passaram.\n');
process.exit(falhas ? 1 : 0);
