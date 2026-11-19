# Arquitectura: decisiones y restricciones

Cada decisión incluye su porqué. Si una cambia, actualizar también `docs/plan.md` en el mismo commit.

## Visión general

- **Tres capas.** El servidor (`server/`) solo empareja dispositivos y reenvía `signal` (SDP/ICE). Nunca ve contenido. Los datos van por un `RTCDataChannel` abierto por `client/src/sala/conexion-webrtc.ts`.
- **Contrato único** en `shared/protocolo/protocol.ts`: `ToServer`/`FromServer` (cliente↔servidor por WebSocket en `/ws`) y `PeerMsg` (dispositivo↔dispositivo, JSON; los bloques de archivo van en binario).
- **Estado central en el cliente:** `client/src/sala/use-sala.ts` une señalización, canal WebRTC, lista compartida, colas de descarga, latido, reanudación y reconexión. Las pantallas solo pintan lo que devuelve.

## Decisiones

| Decisión                                                                                                       | Porqué                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Los datos van por WebRTC directo, no por el servidor.                                                          | Privacidad: el servidor no ve ni guarda contenido. Es un proyecto personal y el dato no tiene por qué pasar por un tercero.     |
| El servidor no tiene base de datos ni escribe en disco.                                                        | Todo lo de una sesión se borra al cerrarla. Docker monta el contenedor con `read_only`.                                         |
| Emparejamiento con token de 8 caracteres sin caracteres ambiguos (`23456789ABCDEFGHJKMNPQRSTUVWXYZ`).          | Legible en pantalla y al escanear un QR. Sin caracteres que se confundan (0/O, 1/I/l).                                          |
| El token caduca a los 5 minutos si nadie lo usa.                                                               | Reduce la ventana para que alguien ajeno se empareje antes que el otro dispositivo.                                             |
| Quien se une ofrece (`createOffer`); quien espera responde.                                                    | Un único lado inicia la negociación; evita colisiones de ofertas simultáneas.                                                   |
| El creador acepta o rechaza a quien quiere unirse (60 s para decidir).                                         | Un token filtrado no basta para entrar sin que el creador lo confirme.                                                          |
| Límites por IP: 20 fallos por minuto, 200 fallos globales por minuto, 10 salas creadas por minuto.             | Frena la fuerza bruta sobre tokens sin afectar al uso normal.                                                                   |
| Ventana de envío de 8 MB con `file-ack` del receptor.                                                          | Sin control de flujo el receptor acumula en memoria todo lo que manda el emisor (riesgo ya corregido, ver `docs/seguridad.md`). |
| Trozos de 64 KB por mensaje del canal.                                                                         | Más de 64 KB no interopera con todos los navegadores.                                                                           |
| Todo lo que llega del otro dispositivo se valida y los nombres se sanean (`transferencia/validar-entrada.ts`). | El otro lado es entrada no fiable: tipos, tamaños, ids y nombres de archivo (rutas, nombres reservados, caracteres de control). |
| El motor de transferencia está en `client/src/transferencia/`, separado de las pantallas.                      | Lo usan la sala y las dos pantallas. Si viviera dentro de una feature, habría imports entre features.                           |
| Tailwind + tema de colores fijo (`crema`, `tinta`, `acento`, `superficie`, `borde`, `ok`).                     | Un solo aspecto en móvil y PC, sin colores sueltos.                                                                             |
| La pestaña Texto se carga aparte (`React.lazy`).                                                               | Highlight.js pesa; no se descarga si el usuario no abre Texto.                                                                  |
| Sin ESLint. Calidad con `tsc`, Prettier y el chequeo de arquitectura (`scripts/check-arquitectura.mjs`).       | Menos dependencias. El chequeo de arquitectura es un script sin dependencias.                                                   |
| Tests aplazados y en `tests/`.                                                                                 | Decisión del usuario. Cuando existan, nunca junto al código.                                                                    |
| El puerto 443 solo se abre en la red de casa. Nunca redirección de puertos en el router, ni DMZ ni UPnP.       | Exposición mínima. El acceso externo es solo por el dominio y Caddy.                                                            |
| La CSP y las cabeceras de seguridad las pone el servidor (`server/index.ts`).                                  | Un solo sitio donde revisar la política. Ver `docs/seguridad.md`.                                                               |
| Docker Compose con Caddy (plugin DuckDNS) para HTTPS.                                                          | Desde otro dispositivo, la API del portapapeles solo funciona con HTTPS (o `localhost`).                                        |

## Restricciones

- Node 24 en desarrollo y en Docker.
- pnpm es el único gestor. Dependencias nuevas solo con aprobación del usuario.
- Interfaz en español; móvil a 360 px.
- `localStorage` y `sessionStorage` siempre dentro de `try/catch`.
- Saltos de línea `LF` para que Docker funcione en Windows.
- No registrar contenido ni tokens completos en logs.

## Enlaces

- Mapa de features y dependencias: `docs/feature-map.md`.
- Plan y mapa de archivos: `docs/plan.md`.
- Seguridad y riesgos aceptados: `docs/seguridad.md`.
- Procedimientos: `docs/runbooks/`.
