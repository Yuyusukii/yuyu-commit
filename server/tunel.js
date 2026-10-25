import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Abre um túnel grátis da Cloudflare (cloudflared, "quick tunnel"): ele dá um link
// https://xxxx.trycloudflare.com que leva até este PC. Com ele:
//  - quem está fora do seu Wi-Fi consegue entrar;
//  - o microfone funciona no celular (os navegadores só liberam o mic em https).
// O link muda toda vez que o site é iniciado.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOCAL = path.join(__dirname, '..', 'ferramentas', process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');

function acharCloudflared() {
  if (fs.existsSync(LOCAL)) return LOCAL;
  const r = spawnSync('cloudflared', ['--version'], { stdio: 'ignore', shell: false });
  return r.status === 0 ? 'cloudflared' : null;
}

let linkPublico = null;

export function linkDoTunel() {
  return linkPublico;
}

// Devolve 'abrindo', 'desligado' (SEM_TUNEL) ou 'sem-programa' (cloudflared não encontrado).
export function iniciarTunel(porta, aoFicarPronto) {
  if (process.env.SEM_TUNEL) return 'desligado';
  const exe = acharCloudflared();
  if (!exe) return 'sem-programa';

  let processo = null;
  let encerrando = false;
  let tentativas = 0;

  function abrir() {
    processo = spawn(exe, ['tunnel', '--url', `http://localhost:${porta}`, '--no-autoupdate'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // O cloudflared escreve o link no meio do log.
    const lerSaida = (pedaco) => {
      const achado = pedaco.toString().match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (achado && !linkPublico) {
        linkPublico = achado[0];
        tentativas = 0;
        aoFicarPronto(linkPublico);
      }
    };
    processo.stdout.on('data', lerSaida);
    processo.stderr.on('data', lerSaida);
    processo.on('error', () => {}); // erro de execução também cai no "exit"
    processo.on('exit', () => {
      linkPublico = null;
      if (encerrando) return;
      // Caiu (internet oscilou, Cloudflare reiniciou...): abre de novo, esperando cada vez mais.
      tentativas++;
      const espera = Math.min(60, 5 * tentativas);
      console.log(`\n  [túnel] o link https caiu. Abrindo um novo em ${espera} s (o link vai mudar)...\n`);
      setTimeout(abrir, espera * 1000);
    });
  }

  abrir();

  // Fecha o túnel junto com o site.
  process.on('exit', () => {
    encerrando = true;
    processo?.kill();
  });
  process.on('SIGINT', () => process.exit());
  process.on('SIGTERM', () => process.exit());
  return 'abrindo';
}
