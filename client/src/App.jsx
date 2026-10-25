import { useEffect, useState } from 'react';
import Home from './pages/Home.jsx';
import Room from './pages/Room.jsx';
import { navegadorDesatualizado } from './lib/compat.js';

// Aviso com estilo próprio (sem Tailwind), para aparecer certo mesmo onde o visual quebra.
function AvisoNavegadorAntigo() {
  const [aberto, setAberto] = useState(true);
  if (!aberto) return null;
  return (
    <div
      role="alert"
      style={{
        position: 'fixed', left: 8, right: 8, bottom: 8, zIndex: 50, padding: '12px 16px',
        background: '#422006', color: '#fde68a', border: '1px solid #854d0e', borderRadius: 12,
        fontSize: 14, display: 'flex', gap: 12, alignItems: 'center',
      }}
    >
      <span style={{ flex: 1 }}>
        Seu navegador é antigo: partes do site podem aparecer ou funcionar errado. Atualize o navegador
        (no iPhone, atualize o iOS) ou use o Chrome.
      </span>
      <button onClick={() => setAberto(false)} style={{ color: 'inherit' }} aria-label="Fechar aviso">
        ✕
      </button>
    </div>
  );
}

// Rotas simples: "/" é a página inicial e "/sala/<id>" é uma sala.
export default function App() {
  const [caminho, setCaminho] = useState(window.location.pathname);

  useEffect(() => {
    const voltar = () => setCaminho(window.location.pathname);
    window.addEventListener('popstate', voltar);
    return () => window.removeEventListener('popstate', voltar);
  }, []);

  function navegar(novo) {
    window.history.pushState(null, '', novo);
    setCaminho(novo);
  }

  const sala = caminho.match(/^\/sala\/([^/]+)/);
  return (
    <>
      {sala ? <Room salaId={decodeURIComponent(sala[1])} navegar={navegar} /> : <Home navegar={navegar} />}
      {navegadorDesatualizado && <AvisoNavegadorAntigo />}
    </>
  );
}
