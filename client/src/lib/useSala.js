import { useEffect, useState } from 'react';
import { socket, clientId, pedir } from './socket.js';
import { lerApelido } from './apelido.js';
import { ehCelular } from './device.js';

// Entra na sala ao abrir a página, mantém a lista de participantes atualizada
// e entra de novo sozinho se a conexão cair e voltar.
export function useSala(salaId) {
  const [status, setStatus] = useState('entrando'); // entrando | dentro | nao-existe | bloqueada | cheia
  const [sala, setSala] = useState(null);
  const [eu, setEu] = useState(null);
  const [conectado, setConectado] = useState(socket.connected);

  useEffect(() => {
    let ativo = true;

    async function entrar() {
      const resposta = await pedir('sala:entrar', {
        salaId,
        clientId,
        apelido: lerApelido(),
        celular: ehCelular,
      });
      if (!ativo) return;
      if (resposta.erro) {
        setStatus(resposta.erro);
      } else {
        setEu(resposta.eu);
        setStatus('dentro');
      }
    }

    const aoReceberEstado = (estado) => {
      if (estado.id !== salaId) return;
      setSala(estado);
      setConectado(true); // chegou algo do servidor: a conexão está de pé
    };
    // Removido pelo criador: encerra a chamada (eu = null) e mostra o aviso.
    const aoSerExpulso = () => {
      setEu(null);
      setStatus('expulso');
    };
    const aoConectar = () => {
      console.info('[conexão] conectado ao servidor');
      setConectado(true);
    };
    const aoDesconectar = (motivo) => {
      console.info('[conexão] caiu:', motivo);
      setConectado(socket.connected);
    };

    socket.on('sala:estado', aoReceberEstado);
    socket.on('sala:expulso', aoSerExpulso);
    socket.on('connect', aoConectar);
    socket.on('disconnect', aoDesconectar);
    socket.on('connect', entrar);
    if (socket.connected) entrar();

    return () => {
      ativo = false;
      socket.off('sala:estado', aoReceberEstado);
      socket.off('sala:expulso', aoSerExpulso);
      socket.off('connect', entrar);
      socket.off('connect', aoConectar);
      socket.off('disconnect', aoDesconectar);
      socket.emit('sala:sair');
    };
  }, [salaId]);

  const souCriador = Boolean(sala?.participantes.find((p) => p.id === eu)?.criador);

  return {
    status,
    conectado,
    sala,
    eu,
    souCriador,
    bloquear: (valor) => socket.emit('sala:bloquear', valor),
    expulsar: (id) => socket.emit('sala:expulsar', id),
  };
}
