import { useEffect } from 'react';
import { RESOLUCOES, FPS, BITRATES, CONTEUDOS, bitrateEmMbps } from '../lib/tela.js';
import { ehFirefox } from '../lib/compat.js';

function Opcoes({ titulo, valor, opcoes, aoMudar }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm text-neutral-400">{titulo}</legend>
      <div className="flex flex-wrap gap-2">
        {opcoes.map(([v, nome]) => (
          <button
            key={v}
            type="button"
            onClick={() => aoMudar(v)}
            className={`rounded-full border px-3 py-1.5 text-sm transition ${
              valor === v ? 'border-white bg-white text-black' : 'border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            {nome}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Janela de configurações da transmissão de tela.
export default function ConfigTela({ opcoes, aoMudar, transmitindo, fechar }) {
  useEffect(() => {
    const aoApertar = (e) => e.key === 'Escape' && fechar();
    window.addEventListener('keydown', aoApertar);
    return () => window.removeEventListener('keydown', aoApertar);
  }, [fechar]);

  const mudar = (campo) => (valor) => aoMudar(campo, valor);
  const mbps = bitrateEmMbps(opcoes);

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4" onClick={fechar}>
      <div
        className="card flex max-h-full w-full max-w-md flex-col gap-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Configurações da transmissão"
      >
        <div className="flex items-center">
          <h2 className="flex-1 text-lg font-semibold">Transmissão de tela</h2>
          <button className="text-neutral-500 hover:text-white" onClick={fechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {transmitindo && (
          <p className="rounded-xl border border-neutral-800 p-3 text-xs text-neutral-400">
            Você está transmitindo: as mudanças valem na hora. O áudio só muda na próxima transmissão.
          </p>
        )}

        <Opcoes
          titulo="Qualidade"
          valor={opcoes.resolucao}
          opcoes={Object.entries(RESOLUCOES).map(([v, r]) => [v, r.nome])}
          aoMudar={mudar('resolucao')}
        />
        <Opcoes titulo="Quadros por segundo" valor={opcoes.fps} opcoes={FPS.map((f) => [f, `${f} fps`])} aoMudar={mudar('fps')} />
        <Opcoes
          titulo={`Taxa de bits (agora: ${mbps} Mbps)`}
          valor={opcoes.bitrate}
          opcoes={BITRATES.map((b) => [b, b === 'auto' ? 'Automática' : `${b} Mbps`])}
          aoMudar={mudar('bitrate')}
        />

        <div className="flex flex-col gap-2">
          <Opcoes
            titulo="O que você vai mostrar"
            valor={opcoes.conteudo}
            opcoes={Object.entries(CONTEUDOS).map(([v, c]) => [v, c.nome])}
            aoMudar={mudar('conteudo')}
          />
          <p className="text-xs text-neutral-500">{CONTEUDOS[opcoes.conteudo].descricao}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Opcoes
            titulo="Áudio"
            valor={opcoes.audio}
            opcoes={[
              [true, 'Com áudio'],
              [false, 'Sem áudio'],
            ]}
            aoMudar={mudar('audio')}
          />
          <p className="text-xs text-neutral-500">
            Na janela que o navegador abre, marque <b>"Compartilhar áudio"</b>. O áudio funciona ao transmitir uma
            <b> aba</b> ou a <b>tela inteira</b>; ao transmitir só uma janela, os navegadores não mandam o som.
          </p>
          {ehFirefox && (
            <p className="text-xs text-yellow-300">
              No Firefox a transmissão vai sem áudio (limitação dele). Para mandar o som, use Chrome ou Edge.
            </p>
          )}
        </div>

        <p className="text-xs text-neutral-500">
          Cada pessoa recebe cerca de {mbps} Mbps, e quem transmite manda isso para <b>cada</b> pessoa da sala (com 3
          assistindo, {Math.round(mbps * 3 * 10) / 10} Mbps de upload). Se travar, baixe a taxa de bits ou o fps. Alguns serviços (Netflix e outros) deixam a imagem
          preta na transmissão por proteção contra cópia.
        </p>
      </div>
    </div>
  );
}
