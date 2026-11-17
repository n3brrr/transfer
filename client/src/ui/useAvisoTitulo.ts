import { useEffect, useRef } from 'react';

const TITULO = 'Transferir';

// Con la pestaña oculta, cada archivo o texto nuevo del otro dispositivo suma un número al título: «(2) Transferir».
// `recibidos`: cuántos elementos del otro dispositivo hay ahora en las listas.
export function useAvisoTitulo(recibidos: number): void {
  const previo = useRef(recibidos);
  const nuevos = useRef(0);

  useEffect(() => {
    if (recibidos > previo.current && document.visibilityState === 'hidden') {
      nuevos.current += recibidos - previo.current;
      document.title = `(${nuevos.current}) ${TITULO}`;
    }
    previo.current = recibidos;
  }, [recibidos]);

  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      nuevos.current = 0;
      document.title = TITULO;
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      document.removeEventListener('visibilitychange', alVolver);
      document.title = TITULO;
    };
  }, []);
}
