import { useEffect } from 'react';

// Impede o celular (e o notebook) de apagar a tela enquanto a pessoa está na sala.
// O navegador solta esse pedido quando a aba some, então ele é refeito ao voltar.
export function useTelaAcesa(ativo) {
  useEffect(() => {
    if (!ativo || !navigator.wakeLock) return;
    let trava = null;
    let cancelado = false;

    async function pedir() {
      if (document.visibilityState !== 'visible' || trava) return;
      try {
        trava = await navigator.wakeLock.request('screen');
        if (cancelado) trava.release();
        trava.addEventListener('release', () => (trava = null));
      } catch {
        // Sem permissão ou sem suporte (ex.: http no celular): a tela só apaga como de costume.
      }
    }

    pedir();
    document.addEventListener('visibilitychange', pedir);
    return () => {
      cancelado = true;
      document.removeEventListener('visibilitychange', pedir);
      trava?.release();
    };
  }, [ativo]);
}
