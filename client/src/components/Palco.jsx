import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import PlayerSincronizado from './PlayerSincronizado.jsx';
import PlayerTwitchLive from './PlayerTwitchLive.jsx';
import TelaTransmitida from './TelaTransmitida.jsx';
import { pedir, socket } from '../lib/socket.js';
import { podeTransmitirTela } from '../lib/device.js';
import { twitchDisponivel } from '../lib/players/twitch.js';

// YouTube, Vimeo e Twitch têm player oficial com controle: tocam dentro da sala, sincronizados.
// Os outros não oferecem player para outros sites, então o caminho é abrir na própria conta e transmitir a tela.
const STREAMINGS = [
  { id: 'youtube', nome: 'YouTube', cor: '#ff0033', integrado: true, exemplo: 'youtube.com/watch?v=...' },
  { id: 'vimeo', nome: 'Vimeo', cor: '#17d5ff', integrado: true, exemplo: 'vimeo.com/123456' },
  { id: 'twitch', nome: 'Twitch', cor: '#9146ff', integrado: true, exemplo: 'twitch.tv/canal ou twitch.tv/videos/123' },
  { id: 'netflix', nome: 'Netflix', artigo: 'a', cor: '#e50914', site: 'https://www.netflix.com' },
  { id: 'prime', nome: 'Prime Video', artigo: 'o', cor: '#1399ff', site: 'https://www.primevideo.com' },
  { id: 'disney', nome: 'Disney+', artigo: 'o', cor: '#113ccf', site: 'https://www.disneyplus.com' },
  { id: 'max', nome: 'HBO Max', artigo: 'a', cor: '#7b2cff', site: 'https://www.hbomax.com' },
  { id: 'globoplay', nome: 'Globoplay', artigo: 'o', cor: '#fb0234', site: 'https://globoplay.globo.com' },
];

function formatarTempo(segundos) {
  const t = Math.floor(segundos);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const maiuscula = (t) => t[0].toUpperCase() + t.slice(1);

// Nome que aparece na barra em cima do vídeo.
function nomeDoVideo(video) {
  if (video.tipo === 'vimeo') return 'Vimeo';
  if (video.tipo === 'twitch-video') return 'Twitch (vídeo gravado)';
  if (video.tipo === 'twitch-live') return `Twitch · ao vivo: ${video.id}`;
  return 'YouTube';
}
const corDoVideo = (video) => STREAMINGS.find((s) => video.tipo.startsWith(s.id))?.cor ?? '#ff0033';

const AVISO_TWITCH_HTTP =
  'A Twitch só funciona pelo link https da sala (ou no PC que está rodando o site). Peça o link https para quem criou a sala.';

const ERROS = {
  'link-invalido': 'Esse link não é de um vídeo do YouTube, do Vimeo ou da Twitch.',
  'fora-da-sala': 'Você não está na sala. Recarregue a página.',
  devagar: 'Calma! Muitos vídeos trocados seguidos. Espere alguns segundos.',
};

function ColarLink({ compacto, exemplo, aoTerminar }) {
  const [link, setLink] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    if (!link.trim()) return;
    setEnviando(true);
    const resposta = await pedir('video:definir', { link });
    setEnviando(false);
    if (resposta.erro) {
      setErro(ERROS[resposta.erro]);
    } else {
      setLink('');
      setErro('');
      aoTerminar?.();
    }
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-col gap-2">
      <div className="flex gap-2">
        <input
          className={`campo min-w-0 flex-1 ${compacto ? 'py-2 text-sm' : ''}`}
          placeholder={exemplo ? `Cole o link (${exemplo})` : 'Cole um link do YouTube, Vimeo ou Twitch'}
          value={link}
          onChange={(e) => {
            setLink(e.target.value);
            setErro('');
          }}
          autoFocus={compacto}
        />
        <button className={`botao-principal shrink-0 ${compacto ? 'py-2 text-sm' : ''}`} disabled={enviando}>
          Assistir
        </button>
      </div>
      {erro && <p className="text-left text-sm text-red-400">{erro}</p>}
    </form>
  );
}

function EscolherStreaming() {
  const [escolhido, setEscolhido] = useState('youtube');
  const servico = STREAMINGS.find((s) => s.id === escolhido);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-center">
      <p className="font-medium">O que vamos assistir?</p>

      <div className="flex flex-wrap justify-center gap-2">
        {STREAMINGS.map((s) => (
          <button
            key={s.id}
            onClick={() => setEscolhido(s.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
              escolhido === s.id ? 'border-white bg-white text-black' : 'border-neutral-700 hover:bg-neutral-900'
            }`}
          >
            <span className="size-2 rounded-full" style={{ background: s.cor }} />
            {s.nome}
            {s.integrado && (
              <span className={`text-xs ${escolhido === s.id ? 'text-neutral-600' : 'text-neutral-500'}`}>grátis</span>
            )}
          </button>
        ))}
      </div>

      <div className="w-full max-w-md">
        {servico.integrado ? (
          <div className="flex flex-col gap-2">
            <ColarLink exemplo={servico.exemplo} />
            {servico.id === 'twitch' && (
              <p className="text-xs text-neutral-500">
                {twitchDisponivel
                  ? 'Lives: cada um assiste ao vivo. Vídeos gravados: play, pausa e tempo sincronizados.'
                  : AVISO_TWITCH_HTTP}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm text-neutral-400">
            <p>
              {maiuscula(servico.artigo)} {servico.nome} não permite colocar os vídeos dentro de outros sites. Para
              assistirem juntos, quem tem a conta abre {servico.artigo} {servico.nome} no PC e <b className="text-white">transmite a tela</b> para a sala.
            </p>
            {podeTransmitirTela ? (
              <>
                <a href={servico.site} target="_blank" rel="noreferrer" className="botao">
                  Abrir {servico.artigo} {servico.nome} em outra aba
                </a>
                <p className="text-xs text-neutral-500">
                  Depois, volte aqui e clique no botão de transmitir tela, embaixo. Alguns serviços deixam a imagem
                  preta na transmissão por proteção contra cópia.
                </p>
              </>
            ) : (
              <p className="text-xs text-neutral-500">Pelo celular não dá para transmitir. Peça para alguém no PC.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Palco({ sala, voz }) {
  const [trocando, setTrocando] = useState(false);
  const [aviso, setAviso] = useState('');
  const timerAviso = useRef(null);
  const { video } = sala;

  useEffect(() => () => clearTimeout(timerAviso.current), []);

  // Mostra por alguns segundos quem deu play/pausa ou pulou.
  function aoAcaoRemota({ por, tocando, tempo }) {
    if (!por) return;
    setAviso(`${por} ${tocando ? 'deu play' : 'pausou'} em ${formatarTempo(tempo)}`);
    clearTimeout(timerAviso.current);
    timerAviso.current = setTimeout(() => setAviso(''), 4000);
  }

  // Alguém transmitindo a tela ocupa o palco. O YouTube volta de onde parou quando acabar.
  if (voz.minhaTela) {
    return <TelaTransmitida stream={voz.minhaTela} titulo="Você está transmitindo" propria aoParar={voz.pararTela} />;
  }
  if (sala.transmissao) {
    return <TelaTransmitida stream={voz.telaRemota} titulo={`${sala.transmissao.apelido} está transmitindo`} />;
  }

  if (!video) return <EscolherStreaming />;

  const ehTwitch = video.tipo.startsWith('twitch');

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex min-h-9 items-center gap-2 text-sm">
        {trocando ? (
          <>
            <ColarLink compacto aoTerminar={() => setTrocando(false)} />
            <button className="botao py-2 text-sm" onClick={() => setTrocando(false)}>
              Cancelar
            </button>
          </>
        ) : (
          <>
            <span className="size-2 shrink-0 rounded-full" style={{ background: corDoVideo(video) }} />
            <span className="min-w-0 flex-1 truncate text-neutral-400">
              {aviso ? (
                <span className="text-white">{aviso}</span>
              ) : (
                <>
                  {nomeDoVideo(video)}
                  {video.colocadoPor && <> · colocado por {video.colocadoPor}</>}
                </>
              )}
            </span>
            <button className="botao py-1.5 text-sm" onClick={() => setTrocando(true)}>
              Trocar
            </button>
            <button className="botao py-1.5 text-sm" onClick={() => socket.emit('video:remover')}>
              Fechar
            </button>
          </>
        )}
      </div>
      <div className="aspect-video w-full lg:aspect-auto lg:min-h-0 lg:flex-1">
        {ehTwitch && !twitchDisponivel ? (
          <div className="flex h-full items-center justify-center rounded-2xl bg-neutral-950 p-6 text-center text-sm text-neutral-300">
            {AVISO_TWITCH_HTTP}
          </div>
        ) : video.tipo === 'twitch-live' ? (
          <PlayerTwitchLive key={video.versao} canal={video.id} />
        ) : (
          // key: cada vídeo novo monta um player novo, já com a plataforma certa.
          <PlayerSincronizado key={video.versao} video={video} aoAcaoRemota={aoAcaoRemota} />
        )}
      </div>
    </div>
  );
}
