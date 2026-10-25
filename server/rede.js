import os from 'node:os';

// Adaptadores que não são a rede de verdade (máquinas virtuais, WSL, VPN etc.).
const VIRTUAIS = /vEthernet|VirtualBox|VMware|Hyper-V|WSL|Loopback|Bluetooth|Tailscale|ZeroTier|Hamachi/i;

// Faixas de IP de rede de casa (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
function ehRedeLocal(ip) {
  return /^192\.168\./.test(ip) || /^10\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

// Descobre o IP deste PC no Wi-Fi/cabo, para quem está na mesma rede conseguir abrir o site.
export function ipNaRede() {
  const candidatos = [];
  for (const [nome, enderecos] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAIS.test(nome)) continue;
    for (const e of enderecos ?? []) {
      if (e.family === 'IPv4' && !e.internal && ehRedeLocal(e.address)) {
        candidatos.push({ nome, ip: e.address });
      }
    }
  }
  // Prefere Wi-Fi/Ethernet quando houver mais de um.
  candidatos.sort((a, b) => Number(/Wi-?Fi|Ethernet/i.test(b.nome)) - Number(/Wi-?Fi|Ethernet/i.test(a.nome)));
  return candidatos[0]?.ip ?? null;
}
