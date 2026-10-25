// Peças comuns aos adaptadores de player (YouTube, Vimeo, Twitch).
//
// Cada adaptador cria o player oficial da plataforma dentro de uma <div> e oferece a mesma "cara":
//   tempo()      -> segundo atual (síncrono)
//   estado()     -> um dos ESTADOS abaixo
//   tocar(), pausar(), pular(segundos), destruir()
// e avisa mudanças de estado pelo callback aoMudarEstado(estado).

export const ESTADOS = {
  TOCANDO: 'tocando',
  PAUSADO: 'pausado',
  CARREGANDO: 'carregando',
  FIM: 'fim',
  PARADO: 'parado', // ainda não começou
};

// Carrega um script de fora uma vez só.
const carregados = new Map();
export function carregarScript(src, pronto = () => true) {
  if (!carregados.has(src)) {
    carregados.set(
      src,
      new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.onload = () => resolve();
        s.onerror = () => {
          carregados.delete(src);
          reject(new Error(`Não foi possível carregar ${src}`));
        };
        document.head.appendChild(s);
      }).then(async () => {
        // Algumas APIs ficam prontas um pouco depois do script carregar.
        for (let i = 0; i < 50 && !pronto(); i++) await new Promise((r) => setTimeout(r, 100));
      }),
    );
  }
  return carregados.get(src);
}

// Cria a <div> que o player oficial vai ocupar (fora do controle do React).
export function criarAlvo(caixa) {
  const alvo = document.createElement('div');
  alvo.style.width = '100%';
  alvo.style.height = '100%';
  caixa.appendChild(alvo);
  return alvo;
}
