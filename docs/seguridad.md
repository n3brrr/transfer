# Transferir — Seguridad

Revisión hecha leyendo el código (no se ha probado nada en navegador). Lo que se deduce del código, no de una ejecución, se indica así.

## Modelo de amenazas

1. **Otro dispositivo de la red o visitante del Wi-Fi**: intenta adivinar códigos, saturar el servidor o abrir la web.
2. **Página web maliciosa** abierta en el navegador del usuario: intenta abrir un WebSocket contra el servidor.
3. **El otro dispositivo emparejado es un par no fiable** (comprometido, o un atacante que consiguió el código): todo lo que llega por el canal de datos es entrada hostil.
4. **Cadena de suministro**: dependencias npm, imágenes Docker y el módulo de Caddy `caddy-dns/duckdns` (de terceros).
5. **Fuga de secretos**: `DUCKDNS_TOKEN` y `.env`.

El servidor solo ve el saludo WebRTC (SDP, candidatos ICE, huellas DTLS); nunca archivos ni textos. Las salas viven en memoria y el código no va en la URL del WebSocket.

## Hallazgos

| Gravedad | Hallazgo | Estado | Dónde |
|---|---|---|---|
| Media | El otro dispositivo conoce los ids de mis archivos y textos y podía sobrescribirlos o borrarlos de mi lista (`file-add`, `file-remove`, `text-add`, `text-remove` con un id mío) | Corregido | `state/sala.ts` (`onMessage`) |
| Media | `text-add` con `part`/`parts` absurdos: array disperso gigante al juntar el texto y memoria sin límite | Corregido | `state/sala.ts` (`parseMsg`, caso `text-add`) |
| Media | Mensajes del canal sin validar (tamaño negativo/NaN/enorme, ids raros, `__proto__` como id y clave de objeto, listas sin tope) | Corregido | `state/sala.ts` (`parseMsg`, límites `MAX_*`) |
| Media | Nombre de archivo del otro dispositivo usado tal cual en `showSaveFilePicker` y `a.download` (rutas, `CON`, carácter RTL override (U+202E) que invierte la extensión, longitud) | Corregido | `files/validar.ts` (`sanitizeName`), aplicado en `parseMsg` |
| Media | Sin CSP ni cabeceras de seguridad | Corregido | `server/index.ts` (`securityHeaders`), `docker/Caddyfile` |
| Media | `X-Forwarded-For` se leía siempre y el primer valor lo puede falsear el cliente en acceso directo: saltaba el límite por IP | Corregido | `server/index.ts` (`ipOf`, `TRUST_PROXY`), `docker-compose.yml` |
| Media | El WebSocket aceptaba cualquier `Origin` cuyo host coincidiera con `Host` (permite DNS rebinding si se accede en directo) | Corregido | `server/index.ts` (`originAllowed`), `ALLOWED_ORIGINS` fijado en compose |
| Media | El receptor acumulaba en memoria todo lo que el emisor mandara sin respetar la ventana de 8 MB | Corregido | `files/chunker.ts` (`MAX_PENDING`) |
| Media | Quien vea o consiga el código (5 min de vida) y lo use antes que el otro dispositivo se empareja con el creador sin que este lo confirme | Pendiente | ver "Mejoras futuras" |
| Baja | `mime` del otro dispositivo usado en `Blob` (tipos activos como `text/html` o `image/svg+xml`) | Corregido | `files/validar.ts` (`sanitizeMime`) |
| Baja | `format` de texto desconocido llegaba a `hljs.getLanguage` y a la interfaz | Corregido | `files/validar.ts` (`sanitizeFormat`) |
| Baja | Extensiones ejecutables sin aviso al descargar | Corregido (aviso, no bloquea) | `screens/Archivos.tsx`, `files/validar.ts` (`isDangerousName`) |
| Baja | Conexiones WebSocket abiertas sin crear ni unirse a sala ocupaban cupo (200 en total, 20 por IP) | Corregido | `server/index.ts` (`IDLE_MS`) |
| Baja | Un destinatario que no lee dejaba crecer el búfer de salida del servidor | Corregido | `server/index.ts` (`send`, `MAX_BUFFERED_BYTES`) |
| Baja | `maxPayload` de 64 KB; un saludo WebRTC cabe de sobra en 16 KB | Corregido | `server/index.ts` |
| Baja | `signal` con `data` nulo o no objeto lanzaba error en el cliente | Corregido | `net/peer.ts`, `net/signaling.ts` |
| Baja | La app podía salir a internet desde su contenedor y los registros de Docker crecían sin límite | Corregido | `docker-compose.yml` (red `interna`, `logging`) |
| Baja | La red de casa puede ver el 443; su filtrado depende del firewall de Windows y del router. Docker Desktop publica el puerto por su cuenta y no se ha comprobado que la regla "Privada" lo cubra | Pendiente de comprobar | `docs/arranque.md` (advertencia añadida) |
| Media | `xcaddy build --with github.com/caddy-dns/duckdns` sin versión: se compila lo último de un módulo de terceros que recibe el token de DuckDNS. Imágenes `node:24-slim`, `caddy:2` y `caddy:2-builder` por etiqueta, no por resumen | Pendiente | `docker/Dockerfile.caddy`, `docker/Dockerfile` |
| Baja | La imagen de producción instala también `react`, `react-dom` y `highlight.js` (solo hacen falta en el build del cliente) | Pendiente | `package.json` (moverlos a `devDependencies` exige regenerar el lockfile) |
| Baja | Un par hostil puede inundar el canal de mensajes y congelar la pestaña del otro | Aceptado | — |
| Baja | Con Docker Desktop, Caddy puede ver todas las peticiones de la LAN con la misma IP (deducido del código, no comprobado): los límites por IP actúan como globales | Aceptado | `server/limiter.ts` |
| Baja | Un dispositivo de la LAN que falle 20 uniones/min bloquea a esa IP; 200/min en total bloquea las uniones de todos durante un minuto | Aceptado | `server/limiter.ts` |
| Baja | Los códigos fallidos distinguen `not_found`/`full`/`expired`: confirma si un código existe | Aceptado | `server/rooms.ts` |
| Baja | `sessionStorage` guarda el código de sala y el `deviceId` (quien lo robe puede volver a una sala emparejada) | Aceptado | `net/signaling.ts` |
| Baja | `pnpm audit` | Sin vulnerabilidades conocidas | `pnpm-lock.yaml` |

## Qué se comprobó y está bien (leyendo el código)

- **Fuerza bruta**: 31^8 ≈ 8,5·10^11 códigos; 20 fallos/min por IP, 200/min global, códigos de 5 min y a lo sumo 200 salas. Con el tope global, el acierto en 5 minutos es del orden de 10^-7 o menos.
- **Secuestro de sala**: unirse a una sala emparejada exige token y `deviceId`; el `deviceId` nunca sale del servidor ni lo ve el otro dispositivo. Con solo el token se recibe `full`.
- **Rutas HTTP**: se rechazan `..`, archivos que empiezan por `.`, `:` y `\0`; todo se resuelve dentro de `client/dist`.
- **XSS**: el único `dangerouslySetInnerHTML` es la salida de `hljs.highlight` (escapa el HTML), con `format` limitado a una lista y contenido de hasta 100.000 caracteres. No hay `innerHTML`, `eval`, `Function`, `document.write` ni enlaces externos. Nombres y textos los pinta React como texto.
- **Registro**: el servidor solo escribe el puerto y "Error inesperado (código)"; el cliente solo `console.error` de errores de oyentes. Ni tokens, ni IPs, ni contenido.
- **Almacenamiento**: nada en `localStorage`; `sessionStorage` con `try/catch`.
- **Docker**: contenedor `app` con usuario `node`, `read_only`, `cap_drop: ALL`, `no-new-privileges`, límites de memoria/procesos/CPU, `init`, healthcheck y sin puerto publicado. `.env` está en `.dockerignore` y `.gitignore`. `env_file` solo pasa `DOMAIN` y `DUCKDNS_TOKEN` al contenedor de Caddy (no al de la app).
- **Dependencias**: `pnpm install --frozen-lockfile` en Docker, versión de pnpm fijada y `allowBuilds` solo para `esbuild`.

## Riesgos residuales aceptados

- **El servidor de señalización ve las huellas DTLS y podría hacer de intermediario** si estuviera comprometido (cambiar la huella y colocarse entre los dos). Es el servidor del propio usuario, en su PC y en su LAN. Un código de verificación entre ambos dispositivos mitigaría solo este caso y añade un paso en cada emparejamiento: no compensa.
- **Los STUN de Google y Cloudflare ven la IP pública** de quien conecta. El diseño es de LAN; los candidatos locales llegan como nombres mDNS en Chrome y Firefox, no como IPs. Quitar los STUN podría romper la conexión en redes que bloqueen mDNS, así que no se ha tocado.
- **Un par con el código es un par legítimo para WebRTC**: lo único que se le puede negar es que su entrada dañe la app (hecho) o que adivine el código (límites).
- **El token de DuckDNS está en el entorno del contenedor de Caddy** y se ve con `docker inspect` o `docker compose config`. Solo lo ve quien ya tenga acceso a Docker en ese PC, que también puede leer `.env`. El token solo controla tus dominios de DuckDNS.
- **Dominio de DuckDNS compartido**: HSTS se pone con `max-age` de 30 días, sin `includeSubDomains` ni `preload`.
- **El navegador del par hostil** puede enviar al otro nombres o textos engañosos (el contenido es suyo). Se avisa de extensiones ejecutables y se limpia el nombre, pero no se analiza el archivo.

## Qué NO hacer nunca

- Redirigir puertos del router hacia este PC, activar DMZ, UPnP o abrir el 443 en el perfil de red Pública del firewall.
- Apuntar el dominio de DuckDNS a la IP pública. Debe apuntar siempre a la IP local.
- Exponer el puerto 8080 de la app (`ports:` en vez de `expose:`).
- Subir `.env` al repositorio, pegarlo en chats o copiar el token de DuckDNS a otros archivos.
- Usar `docker compose down -v` (borra el certificado), o poner la app detrás de otro proxy sin revisar `TRUST_PROXY`.
- Dar el código a nadie por un canal que no sea la propia pantalla o voz del usuario; el código vale 5 minutos.

## Mejoras futuras

1. **Confirmar el emparejamiento en el creador** ("Un dispositivo quiere unirse. ¿Aceptar?"). Es la mitigación que falta contra quien vea o adivine el código; hoy el creador no sabe quién ha entrado.
2. **Fijar versiones**: `caddy-dns/duckdns` a una versión concreta (comprobando que compila con el Caddy que baje `caddy:2-builder`) e imágenes base por resumen (`@sha256:`). Revisar de vez en cuando `pnpm audit`.
3. Mover `react`, `react-dom` y `highlight.js` a `devDependencies` y regenerar el lockfile, para que la imagen final solo lleve `ws`.
4. Comprobar desde otro dispositivo de la LAN y desde fuera (datos móviles) qué puertos responden; reservar la regla de firewall solo para el perfil Privado y la subred local (`-RemoteAddress LocalSubnet`).
5. Limitar por IP las salas que se pueden crear por minuto y registrar (sin datos personales) el contador de bloqueos.
6. En Fase 2 (túnel y TURN): revisar de nuevo todo este documento; ya no valdría "solo LAN". Habría que añadir autenticación real y un TURN con credenciales temporales.
