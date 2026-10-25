// Bolinha colorida com a qualidade da conexão com uma pessoa (passe o mouse para ver os números).
function avaliar(q) {
  if (!q || q.estado === 'new' || q.estado === 'connecting') return ['bg-neutral-600 animate-pulse', 'Conectando...'];
  if (q.estado !== 'connected') return ['bg-red-500', 'Sem conexão direta. Tentando reconectar...'];

  const partes = [];
  if (q.ping != null) partes.push(`ping ${q.ping} ms`);
  if (q.perda != null) partes.push(`perda ${q.perda.toFixed(1)}%`);
  if (q.direta === false) partes.push('via servidor TURN');
  const detalhes = partes.join(' · ') || 'conectado';

  const ping = q.ping ?? 0;
  const perda = q.perda ?? 0;
  if (ping > 300 || perda > 8) return ['bg-red-500', `Conexão ruim: ${detalhes}`];
  if (ping > 150 || perda > 2) return ['bg-yellow-400', `Conexão instável: ${detalhes}`];
  return ['bg-green-400', `Conexão boa: ${detalhes}`];
}

export default function SinalConexao({ qualidade }) {
  const [cor, texto] = avaliar(qualidade);
  return (
    <span className="flex size-4 items-center justify-center" title={texto} aria-label={texto} role="img">
      <span className={`size-2 rounded-full ${cor}`} />
    </span>
  );
}
