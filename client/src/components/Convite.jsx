import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import Icon from './Icon.jsx';
import { linkDaSala } from '../lib/endereco.js';
import { ehCelular } from '../lib/device.js';

// Copia texto. A API moderna só existe em https/localhost; fora disso usa o jeito antigo.
async function copiar(texto, campo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    campo.select();
    return document.execCommand('copy');
  }
}

export default function Convite({ salaId, fechar }) {
  const [link, setLink] = useState('');
  const [qr, setQr] = useState('');
  const [copiado, setCopiado] = useState(false);
  const campo = useRef(null);

  useEffect(() => {
    linkDaSala(salaId).then((l) => {
      setLink(l);
      QRCode.toDataURL(l, { margin: 1, width: 220 }).then(setQr);
    });
  }, [salaId]);

  useEffect(() => {
    const aoApertar = (e) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', aoApertar);
    return () => window.removeEventListener('keydown', aoApertar);
  }, [fechar]);

  async function aoCopiar() {
    if (await copiar(link, campo.current)) {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    }
  }

  const soNaRede = link.startsWith('http://');

  return (
    <div
      className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4"
      onClick={fechar}
    >
      <div
        className="card flex w-full max-w-sm flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Convidar pessoas"
      >
        <div className="flex items-center gap-2">
          <Icon name="link" />
          <h2 className="flex-1 text-lg font-semibold">Convidar pessoas</h2>
          <button className="text-neutral-500 hover:text-white" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        <p className="text-sm text-neutral-400">Mande este link. Quem abrir entra direto na sala.</p>

        <div className="flex gap-2">
          <input
            ref={campo}
            className="campo min-w-0 flex-1 py-2 text-sm"
            value={link || 'Gerando link...'}
            readOnly
            onFocus={(e) => e.target.select()}
          />
          <button className="botao shrink-0 py-2 text-sm" onClick={aoCopiar} disabled={!link}>
            <Icon name="copy" className="size-4" />
            {copiado ? 'Copiado!' : 'Copiar'}
          </button>
        </div>

        {navigator.share && link && (
          <button className="botao-principal" onClick={() => navigator.share({ url: link }).catch(() => {})}>
            Compartilhar
          </button>
        )}

        {!ehCelular && qr && (
          <div className="flex flex-col items-center gap-2">
            <img src={qr} alt="QR code do link da sala" className="size-44 rounded-xl" />
            <p className="text-xs text-neutral-500">Aponte a câmera do celular para entrar.</p>
          </div>
        )}

        {link.startsWith('https://') && (
          <p className="text-xs text-neutral-500">
            Funciona de qualquer lugar, no PC e no celular. O link muda toda vez que o site é reiniciado.
          </p>
        )}

        {soNaRede && (
          <p className="rounded-xl border border-neutral-800 p-3 text-xs text-neutral-400">
            Este link só funciona para quem estiver no <b>mesmo Wi-Fi</b> que o PC que está rodando o site, e
            no celular dá para ouvir mas não falar. Para um link https que funciona de qualquer lugar, rode o
            site pelo <b>iniciar.bat</b> e aceite baixar o cloudflared.
          </p>
        )}
      </div>
    </div>
  );
}
