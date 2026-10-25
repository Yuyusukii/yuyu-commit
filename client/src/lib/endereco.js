// Monta o link de convite da sala.
// "localhost" só funciona no próprio PC, então quem abriu o site assim recebe o melhor
// endereço que o servidor conhece (link https do túnel, ou o IP no Wi-Fi). Quem já entrou
// por outro endereço (um convidado, por exemplo) repassa o mesmo endereço que está usando.
const abertoPeloProprioPC = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);

async function baseConvite() {
  if (!abertoPeloProprioPC) return window.location.origin;
  // Sem guardar: o link https do túnel pode ficar pronto alguns segundos depois do site.
  try {
    const { base } = await fetch('/api/endereco').then((r) => r.json());
    return base ?? window.location.origin;
  } catch {
    return window.location.origin;
  }
}

export async function linkDaSala(salaId) {
  return `${await baseConvite()}/sala/${salaId}`;
}
