import { useEffect, useRef, useState } from 'react';
import { ehCelular } from '../lib/device.js';

// Mostra uma tela transmitida: a de outra pessoa (com som) ou a própria (prévia, sem som).
export default function TelaTransmitida({ stream, titulo, propria, aoParar }) {
  const video = useRef(null);
  const caixa = useRef(null);
  const [semSom, setSemSom] = useState(false);
  const [resolucao, setResolucao] = useState('');

  useEffect(() => {
    const v = video.current;
    if (!v || !stream) return;
    v.srcObject = stream;
    v.muted = propria; // a própria prévia nunca toca som (evita eco)
    v.play().catch(() => {
      // Navegador bloqueou o som automático: toca sem som e oferece o botão.
      v.muted = true;
      setSemSom(true);
      v.play().catch(() => {});
    });
  }, [stream, propria]);

  // Mostra a resolução real que está chegando.
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const atualizar = () => v.videoWidth && setResolucao(`${v.videoWidth}×${v.videoHeight}`);
    v.addEventListener('resize', atualizar);
    return () => v.removeEventListener('resize', atualizar);
  }, []);

  function ativarSom() {
    video.current.muted = false;
    video.current.play().catch(() => {});
    setSemSom(false);
  }

  async function telaCheia() {
    const el = caixa.current;
    if (document.fullscreenElement) return document.exitFullscreen();
    if (!el.requestFullscreen) return video.current.webkitEnterFullscreen?.(); // iPhone
    await el.requestFullscreen().catch(() => {});
    // No celular, deita a tela sozinho (Android; o iPhone faz isso por conta própria).
    if (ehCelular) await screen.orientation?.lock?.('landscape').catch(() => {});
  }

  // Tocar duas vezes no vídeo também entra/sai da tela cheia.
  const aoTocarDuasVezes = () => telaCheia();

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex min-h-9 items-center gap-2 text-sm">
        <span className="size-2 shrink-0 animate-pulse rounded-full bg-red-500" />
        <span className="min-w-0 flex-1 truncate text-neutral-300">
          {titulo}
          {resolucao && <span className="text-neutral-600"> · {resolucao}</span>}
        </span>
        {semSom && (
          <button className="botao-principal py-1.5 text-sm" onClick={ativarSom}>
            Ativar som
          </button>
        )}
        <button className="botao py-1.5 text-sm" onClick={telaCheia}>
          Tela cheia
        </button>
        {propria && (
          <button className="botao border-red-900 py-1.5 text-sm text-red-400 hover:bg-red-950" onClick={aoParar}>
            Parar
          </button>
        )}
      </div>
      <div ref={caixa} className="relative aspect-video w-full overflow-hidden rounded-2xl bg-black lg:aspect-auto lg:min-h-0 lg:flex-1">
        <video
          ref={video}
          className="absolute inset-0 h-full w-full object-contain"
          autoPlay
          playsInline
          onDoubleClick={aoTocarDuasVezes}
        />
        {!stream && (
          <p className="absolute inset-0 flex items-center justify-center text-neutral-500">Conectando à transmissão...</p>
        )}
      </div>
    </div>
  );
}
