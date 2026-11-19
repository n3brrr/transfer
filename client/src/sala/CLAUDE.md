# sala (cliente)

Propósito: emparejar dos dispositivos con un token, negociar WebRTC y mantener la lista compartida de archivos y textos. Es el núcleo del cliente: `use-sala.ts` lo usan `archivos` y `texto`.

Invariantes:

- Quien se une ofrece (`createOffer`); quien espera responde. No invertir los papeles.
- El estado de la sala vive en `use-sala.ts`. Las pantallas solo pintan lo que devuelve; no duplicar estado en ellas.
- Las rutas de salida (`senalizacion.ts`, `conexion-webrtc.ts`) no deben importar de `archivos/` ni `texto/`.

Trampas conocidas:

- Un mensaje del canal puede llegar antes de que la UI esté lista: no asumir orden entre señalización y datos.
- `nombre-dispositivo.ts` guarda el nombre en `localStorage` (dentro de `try/catch`) y lo limpia con `sanitizeDeviceName`. El nombre del otro dispositivo llega por el canal: también se sanea antes de mostrarlo.
- `mensajes.ts` guarda los textos recibidos del otro lado: se validan con `transferencia/validar-entrada.ts` antes de añadirse a la lista.
- Los tokens completos no se registran en consola ni en logs.
