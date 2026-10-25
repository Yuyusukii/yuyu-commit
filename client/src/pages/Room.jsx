import { lazy, Suspense, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { podeTransmitirTela } from '../lib/device.js';
import { useSala } from '../lib/useSala.js';
import { useChamada } from '../lib/useChamada.js';
import { useTelaAcesa } from '../lib/useTelaAcesa.js';

import Palco from '../components/Palco.jsx';

// Janelas que só abrem quando a pessoa clica: carregadas só nessa hora (o QR code é a maior parte).
const Convite = lazy(() => import('../components/Convite.jsx'));
const ConfigTela = lazy(() => import('../components/ConfigTela.jsx'));
import SinalConexao from '../components/SinalConexao.jsx';

const MENSAGENS_ERRO = {
  'nao-existe': [
    'Sala não encontrada',
    'O link pode estar errado, a sala pode ter fechado por ficar vazia, ou o site foi reiniciado (as salas somem quando ele desliga).',
  ],
  bloqueada: ['Sala bloqueada', 'Quem criou a sala não está deixando novas pessoas entrarem.'],
  cheia: ['Sala cheia', 'Essa sala já está com o máximo de pessoas.'],
  devagar: ['Muitas tentativas', 'Você tentou entrar em salas muitas vezes seguidas. Espere um minuto e tente de novo.'],
  invalido: ['Não foi possível entrar', 'Recarregue a página e tente de novo.'],
  expulso: ['Você foi removido da sala', 'Quem criou a sala tirou você dela.'],
};

// Página da sala: palco (YouTube ou tela transmitida), pessoas e controles da chamada.
export default function Room({ salaId, navegar }) {
  const [aba, setAba] = useState('pessoas');
  const [configurando, setConfigurando] = useState(false);
  const [convidando, setConvidando] = useState(false);

  const { status, conectado, sala, eu, souCriador, bloquear, expulsar } = useSala(salaId);
  const voz = useChamada(sala, eu);
  useTelaAcesa(status === 'dentro');

  if (MENSAGENS_ERRO[status]) {
    const [titulo, texto] = MENSAGENS_ERRO[status];
    return (
      <main className="mx-auto flex min-h-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-2xl font-bold">{titulo}</h1>
        <p className="text-neutral-400">{texto}</p>
        <button className="botao-principal" onClick={() => navegar('/')}>
          Voltar ao início
        </button>
      </main>
    );
  }

  if (status === 'entrando' || !sala) {
    return <p className="flex h-full items-center justify-center text-neutral-500">Entrando na sala...</p>;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Topo */}
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <button className="shrink-0 whitespace-nowrap text-lg font-bold" onClick={() => navegar('/')}>
          Yuyu Commit
        </button>
        <span className="hidden truncate text-sm text-neutral-500 sm:inline">sala {salaId}</span>
        {souCriador && (
          <button
            className="botao ml-auto py-2 text-sm"
            onClick={() => bloquear(!sala.bloqueada)}
            title={sala.bloqueada ? 'Deixar novas pessoas entrarem' : 'Impedir novas pessoas de entrar'}
          >
            <Icon name={sala.bloqueada ? 'lock' : 'unlock'} className="size-4" />
            <span className="hidden sm:inline">{sala.bloqueada ? 'Bloqueada' : 'Aberta'}</span>
          </button>
        )}
        {!souCriador && sala.bloqueada && (
          <span className="ml-auto flex items-center gap-1 text-sm text-neutral-500">
            <Icon name="lock" className="size-4" /> Bloqueada
          </span>
        )}
        <button className={`botao shrink-0 whitespace-nowrap py-2 text-sm ${souCriador || sala.bloqueada ? '' : 'ml-auto'}`} onClick={() => setConvidando(true)}>
          <Icon name="link" className="size-4" />
          Convidar
        </button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Palco: onde vão aparecer o YouTube e a tela transmitida */}
        <section className="flex flex-col p-3 lg:min-w-0 lg:flex-1 lg:p-4">
          <div className="min-h-56 w-full lg:min-h-0 lg:flex-1">
            <Palco sala={sala} voz={voz} />
          </div>
        </section>

        {/* Painel lateral (embaixo do palco no celular) */}
        <aside className="flex min-h-0 flex-1 flex-col border-neutral-800 lg:w-80 lg:flex-none lg:border-l">
          <nav className="flex border-b border-neutral-800 text-sm">
            {[
              ['pessoas', 'users', `Pessoas (${sala.participantes.length})`],
              ['chat', 'chat', 'Chat'],
            ].map(([id, icone, nome]) => (
              <button
                key={id}
                onClick={() => setAba(id)}
                className={`flex flex-1 items-center justify-center gap-2 py-3 ${
                  aba === id ? 'border-b-2 border-white text-white' : 'text-neutral-500'
                }`}
              >
                <Icon name={icone} className="size-4" /> {nome}
              </button>
            ))}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {aba === 'pessoas' ? (
              <ul className="flex flex-col gap-2">
                {sala.participantes.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl border border-neutral-800 p-3">
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-800 font-semibold uppercase transition ${
                        voz.falando.has(p.id) ? 'ring-2 ring-green-400' : ''
                      }`}
                    >
                      {p.apelido[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">
                        {p.apelido}
                        {p.id === eu && <span className="text-neutral-500"> (você)</span>}
                      </span>
                      {p.criador && <span className="text-xs text-neutral-500">criou a sala</span>}
                    </span>
                    {p.id !== eu && <SinalConexao qualidade={voz.qualidade.get(p.id)} />}
                    <Icon
                      name={p.mic ? 'mic' : 'micOff'}
                      className={`size-4 ${p.mic ? 'text-white' : 'text-neutral-600'}`}
                    />
                    <Icon name={p.celular ? 'phone' : 'monitor'} className="size-4 text-neutral-500" />
                    {souCriador && p.id !== eu && (
                      <button
                        className="text-neutral-600 hover:text-red-400"
                        title={`Remover ${p.apelido} da sala`}
                        aria-label={`Remover ${p.apelido} da sala`}
                        onClick={() => {
                          const aviso = sala.bloqueada
                            ? `Remover ${p.apelido} da sala?`
                            : `Remover ${p.apelido} da sala?

Dica: bloqueie a sala depois, senão a pessoa pode entrar de novo abrindo o link em outra aba.`;
                          if (window.confirm(aviso)) expulsar(p.id);
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </li>
                ))}
                {sala.participantes.length === 1 && (
                  <li className="p-3 text-center text-sm text-neutral-600">
                    <button className="underline hover:text-white" onClick={() => setConvidando(true)}>
                      Mande o link
                    </button>{' '}
                    para alguém entrar.
                  </li>
                )}
              </ul>
            ) : (
              <p className="p-3 text-center text-sm text-neutral-600">O chat da sala aparece aqui.</p>
            )}
          </div>
        </aside>
      </div>

      {!conectado && (
        <div className="flex items-center justify-center gap-2 border-t border-yellow-900 bg-yellow-950 px-4 py-2 text-sm text-yellow-200">
          <span className="size-2 animate-pulse rounded-full bg-yellow-400" />
          Sem conexão com o servidor. Tentando reconectar...
        </div>
      )}

      {/* Avisos da chamada */}
      {(voz.erroMic || voz.erroTela || voz.precisaToque) && (
        <div className="flex items-center gap-3 border-t border-neutral-800 bg-neutral-950 px-4 py-2 text-sm">
          {voz.precisaToque ? (
            <>
              <span className="flex-1 text-neutral-300">O navegador bloqueou o som da chamada.</span>
              <button className="botao-principal py-1.5 text-sm" onClick={voz.liberarAudio}>
                Ativar som
              </button>
            </>
          ) : (
            <>
              <span className="flex-1 text-red-400">{voz.erroMic || voz.erroTela}</span>
              <button
                className="text-neutral-500 hover:text-white"
                onClick={() => {
                  voz.limparErroMic();
                  voz.limparErroTela();
                }}
                aria-label="Fechar aviso"
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}

      {/* Barra de controles da chamada */}
      <footer className="flex items-center justify-center gap-3 border-t border-neutral-800 px-4 py-3">
        <button
          className={`botao-redondo ${voz.micLigado ? 'bg-white text-black hover:bg-neutral-200' : ''}`}
          onClick={voz.alternarMic}
          disabled={!voz.micDisponivel}
          title={
            !voz.micDisponivel
              ? 'O microfone só funciona com link https (por enquanto, só no PC que roda o site)'
              : voz.micLigado
                ? 'Desligar microfone'
                : 'Ligar microfone'
          }
        >
          <Icon name={voz.micLigado ? 'mic' : 'micOff'} />
        </button>
        <button className="botao-redondo" disabled title="Câmera ainda não disponível">
          <Icon name="camera" />
        </button>
        <button
          className={`botao-redondo ${voz.minhaTela ? 'bg-white text-black hover:bg-neutral-200' : ''}`}
          onClick={voz.minhaTela ? voz.pararTela : voz.iniciarTela}
          disabled={!podeTransmitirTela || (sala.transmissao && !voz.minhaTela)}
          title={
            !podeTransmitirTela
              ? 'Transmitir tela só funciona no PC'
              : voz.minhaTela
                ? 'Parar de transmitir'
                : sala.transmissao
                  ? `${sala.transmissao.apelido} já está transmitindo`
                  : 'Transmitir tela'
          }
        >
          <Icon name="screen" />
        </button>
        <button
          className="botao-redondo"
          title="Configurações da transmissão"
          disabled={!podeTransmitirTela}
          onClick={() => setConfigurando(true)}
        >
          <Icon name="settings" />
        </button>
        <button
          className="botao-redondo border-red-900 text-red-400 hover:bg-red-950"
          onClick={() => navegar('/')}
          title="Sair da sala"
        >
          <Icon name="leave" />
        </button>
      </footer>

      <Suspense fallback={null}>
        {convidando && <Convite salaId={salaId} fechar={() => setConvidando(false)} />}
        {configurando && (
          <ConfigTela
            opcoes={voz.opcoesTela}
            aoMudar={voz.mudarOpcaoTela}
            transmitindo={Boolean(voz.minhaTela)}
            fechar={() => setConfigurando(false)}
          />
        )}
      </Suspense>
    </div>
  );
}
