import { useEffect, useRef, useState } from 'react';
import { criarPlayerTwitchLive } from '../lib/players/twitch.js';

// Live da Twitch: cada pessoa assiste o canal ao vivo (não há o que sincronizar além de qual canal é).
export default function PlayerTwitchLive({ canal }) {
  const caixa = useRef(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let cancelado = false;
    let criado = null;
    criarPlayerTwitchLive(caixa.current, canal)
      .then((p) => (cancelado ? p.destruir() : (criado = p)))
      .catch(() => !cancelado && setErro(true));
    return () => {
      cancelado = true;
      criado?.destruir();
    };
  }, [canal]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-black">
      <div ref={caixa} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />
      {erro && (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-neutral-300">
          Não foi possível carregar a Twitch. Verifique a internet.
        </p>
      )}
    </div>
  );
}
