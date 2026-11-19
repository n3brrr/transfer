# transferencia (motor compartido)

Propósito: trocear archivos para el canal, controlar el envío, escribir lo recibido, validar lo que llega del otro lado y generar miniaturas. Lo usan `sala`, `archivos` y `texto`.

Invariantes:

- Cada mensaje del canal mide como mucho 64 KB (`CHUNK_SIZE`). Más grande no interopera con todos los navegadores.
- El emisor no tiene más de 8 MB sin confirmar (`WINDOW`). El receptor confirma (`file-ack`) al escribir, no al recibir.
- Todo lo que llega del otro lado pasa por `validar-entrada.ts`: tipos, tamaños, ids, longitudes y nombres de archivo saneados.
- `MAX_PENDING` (32 MB) limita lo recibido y aún sin escribir: si se supera, la recepción lanza el error «Llegan datos más rápido de lo permitido».

Trampas conocidas:

- Los nombres reservados de Windows (`CON`, `NUL`, `COM1`…) y los caracteres invisibles o de dirección (RTL override, U+202E) se quitan antes de usar el nombre en `showSaveFilePicker` o `a.download`.
- El diálogo de guardar crea el archivo vacío. Si ya existía con contenido, no se borra nunca: cancelar deja el original intacto.
- Las miniaturas: `MAX_MINIATURA` (12.000 caracteres) es el tope de la data URL. Lo que pase de ahí se descarta, sin error.
- `formatos.ts` es la lista única de formatos de texto. Si se añade uno, añadirlo también en `validar-entrada.ts` y en el desplegable de Texto.
