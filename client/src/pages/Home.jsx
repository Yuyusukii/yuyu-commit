import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { lerApelido, salvarApelido } from '../lib/apelido.js';
import { clientId, pedir } from '../lib/socket.js';

// Aceita tanto o link completo (http://.../sala/abc123) quanto só o código.
function extrairCodigo(texto) {
  const limpo = texto.trim();
  const match = limpo.match(/\/sala\/([^/?#]+)/);
  return match ? match[1] : limpo;
}

export default function Home({ navegar }) {
  const [apelido, setApelido] = useState(lerApelido);
  const [codigo, setCodigo] = useState('');

  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState('');

  async function criarSala() {
    salvarApelido(apelido);
    setCriando(true);
    setErro('');
    const resposta = await pedir('sala:criar', { clientId });
    if (resposta.id) return navegar(`/sala/${resposta.id}`);
    setCriando(false);
    setErro(
      resposta.erro === 'devagar'
        ? 'Muitas salas criadas em pouco tempo. Espere um minuto e tente de novo.'
        : resposta.erro === 'lotado'
          ? 'Este PC já está com salas demais abertas. Tente daqui a pouco.'
          : 'Não foi possível criar a sala. Recarregue a página e tente de novo.',
    );
  }

  function entrarSala(e) {
    e.preventDefault();
    const id = extrairCodigo(codigo);
    if (!id) return;
    salvarApelido(apelido);
    navegar(`/sala/${id}`);
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Yuyu Commit</h1>
        <p className="mt-2 text-neutral-400">
          Assista junto, converse e transmita a tela. Sem criar conta.
        </p>
      </header>

      <section className="card flex flex-col gap-3">
        <label htmlFor="apelido" className="text-sm text-neutral-400">
          Seu apelido <span className="text-neutral-600">(opcional)</span>
        </label>
        <input
          id="apelido"
          className="campo"
          placeholder="Ex.: Yuyu"
          maxLength={24}
          value={apelido}
          onChange={(e) => setApelido(e.target.value)}
        />
      </section>

      <section className="card flex flex-col items-center gap-3 text-center">
        <Icon name="plus" className="size-7" />
        <h2 className="text-lg font-semibold">Criar sala</h2>
        <p className="text-sm text-neutral-400">
          Um link exclusivo é gerado para você mandar a quem quiser.
        </p>
        <button className="botao-principal w-full" onClick={criarSala} disabled={criando}>
          {criando ? 'Criando...' : 'Criar sala'}
        </button>
        {erro && <p className="text-sm text-red-400">{erro}</p>}
      </section>

      <form onSubmit={entrarSala} className="card flex flex-col gap-3">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon name="enter" /> Entrar em uma sala
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="campo flex-1"
            placeholder="Cole o link ou o código da sala"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
          />
          <button className="botao" disabled={!codigo.trim()}>
            Entrar
          </button>
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="card">
          <Icon name="monitor" className="mx-auto size-6" />
          <h3 className="mt-2 font-semibold">PC</h3>
          <p className="text-sm text-neutral-400">Assiste, conversa e transmite a tela.</p>
        </div>
        <div className="card">
          <Icon name="phone" className="mx-auto size-6" />
          <h3 className="mt-2 font-semibold">Celular</h3>
          <p className="text-sm text-neutral-400">Assiste, conversa e recebe a transmissão.</p>
        </div>
      </div>
    </main>
  );
}
