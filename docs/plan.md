# Transferir — Plan de implementación

> **Para agentes:** usar superpowers:subagent-driven-development o superpowers:executing-plans. Marcar cada paso `- [ ]` al terminarlo.

**Objetivo:** web app personal para pasar archivos y textos entre 2 dispositivos de la misma red, emparejados con un token.

**Arquitectura:** un servidor Node en el PC (dentro de Docker) sirve la web y hace de puente para el saludo WebRTC. Los archivos y textos van directos entre los dispositivos por un canal WebRTC. Nada se guarda: todo se borra al cerrar.

**Pila:** TypeScript · Vite + React + Tailwind (cliente) · Node + `ws` + `tsx` (servidor) · Vitest · highlight.js · Docker Compose + Caddy (plugin DuckDNS).

**Diseño:** acordado en conversación (no hay spec escrita). Lo esencial está en "Reglas generales".

**Antes de cada tarea:** leer `CLAUDE.md` (o `AGENTS.md`, son iguales). Todas las rutas de este plan son relativas a la carpeta del proyecto `proyectos/transferir/`.

## Reglas generales

- Fondo `#faebd4`, texto `#3b2a1a`, acento `#c8643c`, superficie `#fff8ec`, borde `#d9c19a`, conectado `#5a9a5a`.
- Pantallas aprobadas: 1 Inicio · 2 Sala creada · 3 Archivos · 4 Texto.
- Token: 8 caracteres del alfabeto `23456789ABCDEFGHJKMNPQRSTUVWXYZ`, se muestra como `XXXX-XXXX`.
- Token caduca a los **5 min** si nadie se une. Sala de **máximo 2** dispositivos. Tras unirse, el token no admite dispositivos nuevos.
- Si un dispositivo se cae, la sala le espera **2 min** (reconexión con el mismo `deviceId`).
- Máximo **5 intentos fallidos** de unirse por IP y minuto.
- Los dos dispositivos son iguales: ambos añaden, quitan, descargan.
- Archivos: bloques de **16 KB**, una transferencia a la vez por sentido, sin reanudar si se corta.
- Textos: máximo **1 MB** por fragmento.
- Tests: pocos, solo de lo importante, todos en `tests/`.
- Textos de la interfaz en español y cortos.

## Puntos a vigilar en revisión

1. Token escrito en minúsculas, con espacios o con guion → debe funcionar igual (test en Tarea 2.1).
2. Archivo de 0 bytes → se envía y se recibe vacío, sin colgarse (test en Tarea 3.2).
3. Conexión cortada a mitad de una descarga → se avisa y se descarta el archivo parcial (paso manual en Tarea 3.3).
4. Recargar la página dentro de los 2 min → vuelve a la misma sala (test en Tarea 2.1).
5. Dos archivos con el mismo nombre → se distinguen por `id` y no se pisan (paso manual en Tarea 3.4).

## Estructura de archivos

```
transferir/
  CLAUDE.md, AGENTS.md    reglas (ya existen)
  docs/plan.md            este plan
  .gitignore, .gitattributes
  package.json            scripts y dependencias (uno solo para todo)
  pnpm-lock.yaml          lo genera pnpm
  tsconfig.json
  vitest.config.ts
  shared/
    protocol.ts           tipos de mensajes (servidor y entre dispositivos)
    token.ts              generar y normalizar tokens
  server/
    rooms.ts              salas en memoria: crear, unirse, salir, caducar
    limiter.ts            límite de intentos por IP
    index.ts              HTTP (sirve client/dist) + WebSocket
  client/
    index.html
    vite.config.ts
    src/
      main.tsx, App.tsx   arranque y navegación entre pantallas
      index.css           Tailwind + colores
      net/signaling.ts    cliente WebSocket
      net/peer.ts         conexión WebRTC y canal de datos
      files/chunker.ts    trocear y recomponer archivos
      files/transfer.ts   enviar / recibir por el canal
      state/sala.ts       lista compartida (archivos y textos)
      ui/Header.tsx       pestañas + estado de conexión
      screens/Inicio.tsx, SalaCreada.tsx, Archivos.tsx, Texto.tsx
  tests/
    rooms.test.ts
    chunker.test.ts
  docker/
    Dockerfile, Dockerfile.caddy, Caddyfile
  docker-compose.yml
  .env.example
  .env                    local, nunca en git (Tarea 5.2)
  tmp/                    temporal, ignorado por git
```

## Mapa de archivos

Cada archivo del proyecto, la tarea que lo crea y las que lo modifican. Si un archivo no está aquí, no se crea sin preguntar. `docs/plan.md` lo modifican todas las tareas (casillas).

| Archivo                             | Lo crea                                                                               | Lo modifican            |
| ----------------------------------- | ------------------------------------------------------------------------------------- | ----------------------- |
| `.gitignore`                        | 0.1                                                                                   | —                       |
| `.gitattributes`                    | 0.1                                                                                   | —                       |
| `package.json`                      | 0.1                                                                                   | —                       |
| `pnpm-lock.yaml`                    | 0.1 (pnpm)                                                                            | —                       |
| `tsconfig.json`                     | 0.1                                                                                   | —                       |
| `vitest.config.ts`                  | 0.1                                                                                   | —                       |
| `client/index.html`                 | 0.1                                                                                   | —                       |
| `client/vite.config.ts`             | 0.1                                                                                   | —                       |
| `client/src/main.tsx`               | 0.1                                                                                   | —                       |
| `client/src/App.tsx`                | 0.1                                                                                   | 1.2, 2.4, 3.1, 3.4, 4.1 |
| `client/src/index.css`              | 0.1                                                                                   | —                       |
| `shared/protocol.ts`                | 0.2                                                                                   | —                       |
| `server/index.ts`                   | 0.3                                                                                   | 2.2                     |
| `shared/token.ts`                   | 1.1                                                                                   | —                       |
| `client/src/screens/Inicio.tsx`     | 1.2                                                                                   | 2.4                     |
| `server/rooms.ts`                   | 2.1                                                                                   | —                       |
| `server/limiter.ts`                 | 2.1                                                                                   | —                       |
| `tests/rooms.test.ts`               | 2.1                                                                                   | —                       |
| `client/src/net/signaling.ts`       | 2.2                                                                                   | —                       |
| `client/src/net/peer.ts`            | 2.3                                                                                   | —                       |
| `client/src/screens/SalaCreada.tsx` | 2.4                                                                                   | —                       |
| `client/src/ui/Header.tsx`          | 3.1                                                                                   | —                       |
| `client/src/state/sala.ts`          | 3.1                                                                                   | 3.3                     |
| `client/src/files/chunker.ts`       | 3.2                                                                                   | —                       |
| `tests/chunker.test.ts`             | 3.2                                                                                   | —                       |
| `client/src/files/transfer.ts`      | 3.3                                                                                   | —                       |
| `client/src/screens/Archivos.tsx`   | 3.4                                                                                   | —                       |
| `client/src/screens/Texto.tsx`      | 4.1                                                                                   | —                       |
| `docker/Dockerfile`                 | 5.1                                                                                   | —                       |
| `docker/Dockerfile.caddy`           | 5.1                                                                                   | —                       |
| `docker/Caddyfile`                  | 5.1                                                                                   | —                       |
| `docker-compose.yml`                | 5.1                                                                                   | —                       |
| `.env.example`                      | 5.1                                                                                   | —                       |
| `.env` (local, no git)              | 5.2                                                                                   | —                       |
| `docs/arranque.md`                  | — (guía de puesta en marcha)                                                          | —                       |
| `docs/seguridad.md`                 | — (análisis de seguridad)                                                             | —                       |
| `client/src/files/validar.ts`       | — (segunda ronda)                                                                     | —                       |
| `client/src/files/formatos.ts`      | — (formatos de texto)                                                                 | —                       |
| `client/public/favicon.svg`         | — (segunda ronda)                                                                     | —                       |
| `docker-compose.local.yml`          | — (cuarta ronda: modo rápido local)                                                   | —                       |
| `client/src/files/resaltado.ts`     | — (cuarta ronda: highlight.js y detección de formato; solo lo carga la pestaña Texto) | —                       |
| `client/src/files/miniatura.ts`     | — (cuarta ronda: miniaturas JPEG de las imágenes)                                     | —                       |
| `client/src/files/qr.ts`            | — (cuarta ronda: generador de códigos QR sin dependencias)                            | —                       |
| `client/src/state/mensajes.ts`      | — (cuarta ronda: validación de los mensajes del canal (`parseMsg`))                   | —                       |
| `client/src/state/nombre.ts`        | — (cuarta ronda: nombre del dispositivo en `localStorage`)                            | —                       |
| `client/src/ui/portapapeles.ts`     | — (cuarta ronda: copiar al portapapeles)                                              | —                       |
| `client/src/ui/QrCodigo.tsx`        | — (cuarta ronda: QR en SVG)                                                           | —                       |
| `client/src/ui/useAvisoTitulo.ts`   | — (cuarta ronda: contador de novedades en el título de la pestaña)                    | —                       |
| `dist-server/` (no git)             | `pnpm build:server`                                                                   | —                       |
| `pnpm-workspace.yaml`               | 0.1 (pnpm)                                                                            | —                       |
| `.dockerignore`                     | 5.1                                                                                   | —                       |

---

## FASE 0 · BASE

### Tarea 0.1: Proyecto y herramientas

**Archivos:**

- Crear: `.gitignore`, `.gitattributes`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `client/index.html`, `client/vite.config.ts`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/index.css`
- Generado por pnpm: `pnpm-lock.yaml`
- Ya existen (solo se añaden al primer commit): `CLAUDE.md`, `AGENTS.md`, `docs/plan.md`

- [x] `git init -b main` en `proyectos/transferir`. `.gitignore`: `node_modules`, `dist`, `.env`, `tmp/`, `.superpowers`. `.gitattributes`: `* text=auto eol=lf`.
- [x] Primer commit en `main` con `CLAUDE.md`, `AGENTS.md`, `docs/`, `.gitignore`, `.gitattributes` (`chore: iniciar repositorio`). Crear y pasar a `dev`. Si hay remoto, `git push -u origin main dev`; si no, avisar.
- [x] `package.json` con `"packageManager": "pnpm@<versión actual>"` y dependencias: `react`, `react-dom`, `ws`, `highlight.js`. Desarrollo: `typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `tsx`, `vitest`, `@types/*`.
- [x] `tsconfig.json`: `strict: true`, `jsx: react-jsx`, `module`/`moduleResolution` para Vite (`ESNext`/`Bundler`), `noEmit: true`, incluye `shared`, `server`, `client/src`, `tests`.
- [x] Scripts: `dev:server` = `tsx watch server/index.ts`, `dev:client` = `vite client`, `build` = `vite build client`, `start` = `tsx server/index.ts`, `test` = `vitest run`.
- [x] `client/vite.config.ts`: plugins React y Tailwind. Proxy `/ws` → `ws://localhost:8080`.
- [x] `index.css`: importar Tailwind y declarar los 6 colores de "Reglas generales" como tema (`crema`, `tinta`, `acento`, `superficie`, `borde`, `ok`). Fondo del `body` en `crema`.
- [x] `App.tsx` muestra "Transferir" centrado.
- [ ] Comprobar: `pnpm dev:client` → se ve "Transferir" sobre fondo crema.
- [ ] Commit: `chore: base del proyecto`.

### Tarea 0.2: Protocolo compartido

**Archivos:** crear `shared/protocol.ts`.

**Produce:**

```ts
// Cliente ↔ servidor
type ToServer =
  | { t: 'create'; deviceId: string }
  | { t: 'join'; token: string; deviceId: string }
  | { t: 'signal'; data: unknown }
  | { t: 'leave' }
type FromServer =
  | { t: 'created'; token: string }
  | { t: 'joined' }
  | { t: 'peer-joined' }
  | { t: 'peer-left' }
  | { t: 'signal'; data: unknown }
  | { t: 'error'; code: 'not_found' | 'full' | 'expired' | 'rate_limited' }

// Dispositivo ↔ dispositivo (canal WebRTC, JSON; los bloques de archivo van en binario)
type PeerMsg =
  | { t: 'file-add'; id: string; name: string; size: number; mime: string }
  | { t: 'file-remove'; id: string }
  | { t: 'file-request'; id: string }
  | { t: 'file-start'; id: string }
  | { t: 'file-end'; id: string }
  | { t: 'file-cancel'; id: string }
  | { t: 'text-add'; id: string; format: string; content: string }
  | { t: 'text-remove'; id: string }
```

- [x] Escribir los tipos tal cual.
- [x] Comprobar: `pnpm exec tsc --noEmit` sin errores.
- [ ] Commit: `feat: protocolo compartido`.

### Tarea 0.3: Servidor mínimo

**Archivos:** crear `server/index.ts`.

- [x] Servidor HTTP en el puerto `8080` (o `PORT`) que sirve `client/dist` y devuelve `index.html` para cualquier ruta.
- [x] WebSocket en `/ws` con `ws`. Por ahora solo registra conexiones en consola.
- [x] Comprobar: `pnpm build && pnpm start` → `http://localhost:8080` muestra la app.
- [ ] Commit: `feat: servidor base`.

---

## PANTALLA 1 · INICIO

### Tarea 1.1: Token

**Archivos:** crear `shared/token.ts`. Test en Tarea 2.1.

**Produce:**

- `newToken(): string` → 8 caracteres del alfabeto, sin guion, usando `crypto.getRandomValues`.
- `normalizeToken(input: string): string` → mayúsculas y sin espacios ni guiones.
- `formatToken(token: string): string` → `XXXX-XXXX`.

- [x] Implementar las tres funciones.
- [ ] Commit: `feat: tokens`.

### Tarea 1.2: Pantalla Inicio

**Archivos:**

- Crear: `client/src/screens/Inicio.tsx`
- Modificar: `client/src/App.tsx`

**Produce:** `App` guarda `pantalla: 'inicio' | 'creada' | 'sala'` y la pestaña activa `'archivos' | 'texto'`.

- [x] Título "Transferir", botón **Crear sala**, separador "o", campo **Código** y botón **Unirme** (igual que la maqueta).
- [x] **Unirme** desactivado hasta tener 8 caracteres tras `normalizeToken`.
- [x] Mensajes de error bajo el campo: `not_found` → "Código no válido", `expired` → "El código ha caducado", `full` → "La sala ya está completa", `rate_limited` → "Demasiados intentos, espera un minuto".
- [x] `deviceId`: generarlo una vez y guardarlo en `sessionStorage` (con try/catch).
- [ ] Comprobar a mano: se ve como la maqueta en PC y en ancho de móvil.
- [ ] Commit: `feat: pantalla inicio`.

---

## PANTALLA 2 · SALA CREADA (y emparejamiento)

### Tarea 2.1: Salas en el servidor

**Archivos:** crear `server/rooms.ts`, `server/limiter.ts`. Test: `tests/rooms.test.ts`.

**Produce:**

```ts
class Rooms {
  constructor(now: () => number = Date.now)
  create(deviceId: string): string // devuelve token
  join(token: string, deviceId: string): 'ok' | 'not_found' | 'full' | 'expired'
  leave(deviceId: string): void // abre la espera de 2 min
  peerOf(deviceId: string): string | undefined
}
function allowAttempt(ip: string, now?: number): boolean // limiter.ts, 5 fallos/min
```

- [ ] Escribir tests (fallan):
  - `create` + `join` con otro deviceId → `'ok'`.
  - tercer deviceId → `'full'`.
  - token inexistente → `'not_found'`.
  - `join` pasados 5 min sin nadie → `'expired'`.
  - `join('k7m2 xq9p')` y `join('K7M2-XQ9P')` → `'ok'` (usa `normalizeToken`).
  - `leave(B)` y `join` de B antes de 2 min → `'ok'`; después de 2 min → `'not_found'`.
  - `allowAttempt` da `false` al sexto fallo en el mismo minuto.
- [ ] `pnpm test` → fallan.
- [x] Implementar `Rooms` (un `Map` en memoria) y `allowAttempt`.
- [ ] `pnpm test` → pasan.
- [ ] Commit: `feat: salas con token`.

### Tarea 2.2: Señalización

**Archivos:** modificar `server/index.ts`. Crear `client/src/net/signaling.ts`.

**Consume:** `Rooms`, `allowAttempt`, `ToServer`, `FromServer`.
**Produce:** `connectSignaling(): { send(m: ToServer): void; on(cb: (m: FromServer) => void): void; close(): void }`.

- [x] Servidor: `create` → `created`. `join` → `joined` al que entra y `peer-joined` al creador (o `error`). `signal` → reenviar al otro. Al cerrar el socket → `leave` y `peer-left` al otro.
- [x] Contar como fallo para `allowAttempt` cada `join` que no sea `'ok'`. Si no se permite → `rate_limited`.
- [x] Cliente: conecta a `wss://<host>/ws` (o `ws://` en http).
- [ ] Commit: `feat: señalización`.

### Tarea 2.3: Conexión WebRTC

**Archivos:** crear `client/src/net/peer.ts`.

**Produce:** `connectPeer(sig, initiator: boolean): Promise<RTCDataChannel>`.

- [x] Quien se une es `initiator`: crea el canal `datos` (ordenado, fiable) y la oferta. El creador responde.
- [x] STUN: `stun:stun.l.google.com:19302`.
- [x] Ofertas, respuestas y candidatos viajan como `{ t: 'signal', data }`.
- [x] `channel.binaryType = 'arraybuffer'`.
- [ ] Commit: `feat: conexión entre dispositivos`.

### Tarea 2.4: Pantalla Sala creada

**Archivos:**

- Crear: `client/src/screens/SalaCreada.tsx`
- Modificar: `client/src/screens/Inicio.tsx`, `client/src/App.tsx`

- [x] **Crear sala** → envía `create` → pantalla 2 con el token grande (`formatToken`), "Escríbelo en el otro dispositivo", "Esperando…" y un enlace **Cancelar** que vuelve a Inicio.
- [x] Con `peer-joined` → `connectPeer(sig, false)` → pantalla `sala`.
- [x] En Inicio, **Unirme** → `join` → con `joined` → `connectPeer(sig, true)` → pantalla `sala`.
- [x] A los 5 min sin nadie: "El código ha caducado" + botón **Crear otro**.
- [x] Comprobar a mano: dos pestañas del navegador se emparejan y las dos llegan a `sala`. Una tercera es rechazada.
- [ ] Commit: `feat: pantalla sala creada y emparejamiento`.

---

## PANTALLA 3 · ARCHIVOS

### Tarea 3.1: Cabecera de la sala y lista compartida

**Archivos:**

- Crear: `client/src/ui/Header.tsx`, `client/src/state/sala.ts`
- Modificar: `client/src/App.tsx` (en la pantalla `sala`, mostrar `Header` y la pestaña activa)

**Produce:**

```ts
type FileItem = {
  id: string
  name: string
  size: number
  mime: string
  mine: boolean
  available: boolean
}
type TextItem = { id: string; format: string; content: string; mine: boolean }
function useSala(channel: RTCDataChannel): {
  files: FileItem[]
  texts: TextItem[]
  connected: boolean
  addFiles(list: File[]): void
  removeFile(id: string): void
  addText(format: string, content: string): void
  removeText(id: string): void
  download(id: string): void
  progress: Record<string, number>
}
```

- [x] `Header`: pestañas **Archivos** / **Texto** a la izquierda, punto verde + "Conectado" a la derecha (gris + "Reconectando…" si cae).
- [x] `useSala`: los `File` propios se guardan en un `Map` (no en el estado). Al añadir se envía `file-add`. Al quitar, `file-remove`.
- [x] Al reconectar, cada uno reenvía `file-add` / `text-add` de lo suyo. Si el otro se va, sus archivos pasan a `available: false`.
- [ ] Commit: `feat: cabecera y lista compartida`.

### Tarea 3.2: Trocear y recomponer

**Archivos:** crear `client/src/files/chunker.ts`. Test: `tests/chunker.test.ts`.

**Produce:**

```ts
function chunks(file: Blob, size = 16384): AsyncGenerator<ArrayBuffer>
function receiver(
  expectedSize: number,
  write: (c: ArrayBuffer) => Promise<void>,
): { push(c: ArrayBuffer): Promise<void>; finish(): void } // finish lanza error si el tamaño no cuadra
```

- [ ] Escribir tests (fallan):
  - un Blob de 100 KB aleatorio, troceado y recompuesto → mismos bytes.
  - un Blob de 0 bytes → 0 bloques y `finish()` sin error.
  - recibir menos bytes de los esperados → `finish()` lanza error.
- [ ] `pnpm test` → fallan.
- [x] Implementar.
- [ ] `pnpm test` → pasan.
- [ ] Commit: `feat: troceado de archivos`.

### Tarea 3.3: Enviar y recibir

**Archivos:**

- Crear: `client/src/files/transfer.ts`
- Modificar: `client/src/state/sala.ts`

**Consume:** `chunks`, `receiver`, `PeerMsg`.
**Produce:** `sendFile(ch, id, file, onProgress)` y `receiveFile(ch, item, onProgress): Promise<void>`.

- [x] Envío: `file-start` → bloques binarios → `file-end`. Pausar si `bufferedAmount > 4 MB` y seguir con `bufferedamountlow` (umbral 1 MB). Cola: un envío a la vez.
- [x] Recepción: si existe `showSaveFilePicker`, escribir directo a disco. Si no, juntar en memoria y descargar con `<a download>` al final, avisando antes si pasa de 500 MB.
- [x] Mantener la pantalla encendida (`navigator.wakeLock`) durante la transferencia, si existe.
- [x] **Cancelar** en los dos lados → `file-cancel`.
- [x] Si se corta la conexión a mitad: abortar la escritura, borrar lo parcial y mostrar "Transferencia interrumpida".
- [ ] Commit: `feat: envío y recepción de archivos`.

### Tarea 3.4: Pantalla Archivos

**Archivos:**

- Crear: `client/src/screens/Archivos.tsx`
- Modificar: `client/src/App.tsx` (pestaña Archivos → `Archivos`)

- [x] Zona "Suelta archivos aquí o pulsa para añadir" (arrastrar y soltar + `<input type="file" multiple>`).
- [x] Fila por archivo: nombre, tamaño legible y "Este dispositivo" / "Otro dispositivo" / "No disponible".
- [x] Botones: propio → **Quitar**. Ajeno → **Descargar** (con barra de progreso y **Cancelar** mientras baja). No disponible → fila en gris sin botones.
- [ ] Comprobar a mano: PC↔PC con un archivo pequeño y otro de más de 1 GB. Dos archivos con el mismo nombre no se pisan. Cortar la conexión a mitad muestra el aviso.
- [ ] Commit: `feat: pantalla archivos`.

---

## PANTALLA 4 · TEXTO

### Tarea 4.1: Pantalla Texto

**Archivos:**

- Crear: `client/src/screens/Texto.tsx`
- Modificar: `client/src/App.tsx` (pestaña Texto → `Texto`)

**Consume:** `useSala` (`texts`, `addText`, `removeText`).

- [x] Área "Pega o escribe aquí…", selector de formato y botón **Añadir**.
- [x] Formatos: Texto, Markdown, JSON, JavaScript, TypeScript, Python, HTML, CSS, SQL, Bash. Registrar solo esos lenguajes en highlight.js.
- [x] Si el texto pasa de 1 MB: "Texto demasiado grande (máx. 1 MB)" y no se envía.
- [x] Tarjeta por fragmento: quién lo añadió, contenido con resaltado, **Copiar** (Clipboard API) y **Quitar** si es propio.
- [ ] Comprobar a mano: pegar código en un lado, copiarlo en el otro.
- [ ] Commit: `feat: pantalla texto`.

---

## FASE 5 · DESPLIEGUE EN EL PC

### Tarea 5.1: Docker + HTTPS

**Archivos:** crear `docker/Dockerfile`, `docker/Dockerfile.caddy`, `docker/Caddyfile`, `docker-compose.yml`, `.env.example`.

- [x] `Dockerfile` (app): Node LTS, `corepack enable`, `pnpm install --frozen-lockfile`, `pnpm build`, `CMD ["pnpm", "start"]`, puerto 8080.
- [ ] `Dockerfile.caddy`: `caddy:2-builder` con `xcaddy build --with github.com/caddy-dns/duckdns`, copiado a `caddy:2`.
- [x] `Caddyfile`:
  ```
  {$DOMAIN} {
    tls {
      dns duckdns {$DUCKDNS_TOKEN}
    }
    reverse_proxy app:8080
  }
  ```
- [x] `docker-compose.yml`: servicios `app` y `caddy`, sin política de reinicio (solo arrancan cuando el usuario ejecuta `docker compose up -d`). Caddy publica `443:443` y un volumen para guardar certificados.
- [x] `.env.example`: `DOMAIN=tu-nombre.duckdns.org` y `DUCKDNS_TOKEN=`.
- [ ] Commit: `feat: despliegue docker`.

### Tarea 5.2: Puesta en marcha (manual, una vez)

**Archivos:** crear `.env` copiando `.env.example` (nunca se sube a git). El resto son pasos fuera del proyecto: avisar antes de cada uno.

- [ ] Crear el subdominio en duckdns.org y apuntarlo a la IP local del PC: `https://www.duckdns.org/update?domains=NOMBRE&token=TOKEN&ip=192.168.X.X`.
- [ ] Rellenar `DOMAIN` y `DUCKDNS_TOKEN` en `.env`.
- [ ] Reservar esa IP para el PC en el router.
- [ ] Abrir el puerto en Windows (PowerShell como administrador):
      `New-NetFirewallRule -DisplayName "Transferir" -Direction Inbound -Protocol TCP -LocalPort 443 -Profile Private -Action Allow`
- [ ] Docker Desktop → desactivar «Start Docker Desktop when you sign in». Se abre a mano cuando se vaya a usar.
- [ ] `docker compose up -d --build`.
- [ ] Si el móvil no resuelve el dominio, añadir una excepción de _DNS rebinding_ en el router para ese subdominio.

### Tarea 5.3: Prueba final (manual)

- [ ] PC → móvil y móvil → PC: un archivo pequeño, un texto, un archivo de más de 1 GB.
- [ ] Recargar uno de los dos antes de 2 min → vuelve a la sala.
- [ ] Un tercer dispositivo con el mismo código → "La sala ya está completa".
- [ ] Cerrar sesión → todo desaparece.

---

## Cambios respecto al plan (decididos durante la construcción)

- Los tests (`tests/rooms.test.ts`, `tests/chunker.test.ts` y los demás pasos de tests) siguen aplazados por indicación del usuario. Git ya está en uso: rama `dev`, commits por grupos de archivos y push tras verificar cada bloque.
- `pnpm-workspace.yaml` (con `allowBuilds: esbuild`): pnpm lo exige para que esbuild pueda instalarse.
- `.dockerignore`: sin él, `COPY . .` copiaría `node_modules` de Windows a la imagen.
- Dockerfile: `npm install -g pnpm@12.5.1` en vez de `corepack enable`, para no depender de que corepack conozca esa versión de pnpm.
- `server/limiter.ts`: además de `allowAttempt(ip, now?)` exporta `registerFailure(ip, now?)`. El plan solo definía la primera y no había cómo contar los fallos.
- `server/rooms.ts`: añade `sweep()`, que cierra las salas cuya espera ha terminado (se llama sola cada 15 s). Una sala sin emparejar se cierra al salir su creador; una emparejada espera 2 min.
- `shared/token.ts`: añade `randomId()`; `crypto.randomUUID` no existe en páginas sin HTTPS.
- `shared/protocol.ts`: `text-add` lleva `part` y `parts` (Chrome limita cada mensaje a ~256 KB, así que los textos de hasta 1 MB se parten). Mensaje nuevo `bye`.
- `client/src/net/signaling.ts`: `on()` devuelve la función para dejar de escuchar; añade `onClose()` y las funciones de `sessionStorage` (`getDeviceId`, `saveToken`, `loadToken`, `clearToken`).
- `client/src/files/transfer.ts`: `receiveFile(item, onProgress)` devuelve un `Download` (`push`, `end`, `abort`) en vez de una promesa vacía; los bloques los enruta `state/sala.ts`. `sendFile(ch, id, file, onProgress, cancel)`.
- `client/src/state/sala.ts`: `useSala` devuelve además `notice` (avisos) y `cancelDownload(id)`.
- `Header`: botón **Salir**, que no estaba en la maqueta. Sin él no había forma de cerrar la sala sin cerrar la pestaña; avisa al otro dispositivo con `bye`.
- `docker/Dockerfile.caddy` sin verificar: `xcaddy build` falló dos veces en este PC porque no llega a `proxy.golang.org` (conexión cortada / error de revocación TLS de la red). La imagen de la app sí se construyó y arrancó. Para probarlo hay que ejecutar `docker compose build caddy` en una red que llegue a ese proxy.
- Sin PWA (el usuario no la quiere): se usa abriendo la dirección en el navegador. Docker no arranca con Windows y los contenedores no se reinician solos: el usuario los levanta a mano con `docker compose up -d`.
- **Segunda ronda (mejoras), hecha por agentes dedicados:**
  - Servidor: URL mal formada ya no lo tumba (400); comprueba `Origin`; límites de conexiones, salas, mensajes y fallos (20/min por IP, 200 global); latido; `GET /health`; 404 para estáticos inexistentes; cierre ordenado con SIGTERM. `TRUST_PROXY=1` y `ALLOWED_ORIGINS` los pone `docker-compose.yml`.
  - Conexión: pantalla «Conectando…» con límite de 20 s y reintento (`Conectando`, exportado desde `SalaCreada.tsx`); mensajes distintos para servidor caído, sala inexistente y sala cerrada por el otro; reconexión con espera creciente; el token solo se guarda en `sessionStorage` al emparejarse.
  - Archivos: confirmaciones de recepción (`file-ack`) y ventana de 8 MB; mensajes de 64 KB; descargas en cola; progreso en ambos lados (`transfers` sustituye a `progress` en `useSala`); aviso del respaldo en memoria (200 MB móvil / 500 MB escritorio, máximo 1,5 GB); latido `ping`/`pong` cada 5 s (corta a los 15 s sin señal); reanudación de descargas cortadas (`file-request` con `offset`, estado `paused`, 2 min de espera).
  - Interfaz móvil: variables nuevas en `index.css` (`acento-texto` #ab4f2b y `suave` #6b5a49, para contraste AA), clases `.btn`, `.tarjeta`, `.pantalla`, `.gutter`; cabecera fija con pestañas; favicon; Archivos con pegado de imágenes y carpetas; Texto con autodetección de formato, edición y plegado.
  - Seguridad: CSP y cabeceras (`server/index.ts`), HSTS (Caddy), validación estricta de lo que llega del otro dispositivo, `client/src/files/validar.ts` (nuevo: sanea nombres, mime y formato; avisa de ejecutables), red interna Docker. Detalle en `docs/seguridad.md`.
  - Docker: imagen multietapa sin root, `dist-server/` (`pnpm build:server`), healthcheck, `read_only`, `cap_drop`, límites y registros acotados.
  - **UX (tercera ronda, a petición del usuario):** dependencia nueva `lucide-react` (iconos de tipo de archivo y papelera). Barra de progreso con rayas «\» animadas en terracota/crema (`.barra`, `.barra-relleno`, `.barra-pausada` en `index.css`), igual en descarga y envío; botón de papelera para quitar el archivo propio (y el fragmento propio de texto); botones **Pegar** (solo con HTTPS) y **Limpiar** en Texto; aviso «Descargado/Enviado» con vibración corta al terminar bien; filas que entran con una animación suave (`.entra`), icono de la zona de soltar que salta al arrastrar, iconos en Copiar y rebote al copiado, y pulsación con efecto de hundimiento en los botones. Se respeta `prefers-reduced-motion`.
  - **Formatos de texto ampliados a 28** (`client/src/files/formatos.ts`, archivo nuevo que sustituye a las listas que había en `Texto.tsx` y `validar.ts`): Java, C#, C++, C, Go, Rust, PHP, Kotlin, Swift, Ruby, Dart, R, Lua, PowerShell, YAML, INI/TOML, Diff y Dockerfile, además de los 10 anteriores. YAML, INI, Diff, Dockerfile, PowerShell, Java y Dart se reconocen por pistas (reglas propias) porque `highlightAuto` los confundía con texto normal; R y Lua solo se eligen a mano. Probado en Node con 25 ejemplos de código (25 acertados) y 13 de texto normal (todos quedan como texto). Un YAML plano de dos líneas (`nombre: Ana`) se queda como texto a propósito, para no marcar notas sueltas como YAML.
  - **Código de la sala (Inicio):** se escribe en 8 casillas (4 - 4) con un único campo de texto invisible encima (pegar, autocompletar y lectores de pantalla siguen funcionando). Todo lo que entra pasa por `sanitizeToken` (`shared/token.ts`): solo caracteres del alfabeto, en mayúsculas y como mucho 8; pegar sustituye el código entero. `Unirme` solo se activa con un código válido (`isValidToken`). El servidor aplica la misma regla antes de buscar la sala: un código con otro formato da `not_found` y cuenta como intento fallido. Probado: 10 códigos mal formados en el servidor, entradas hostiles y pegados en Chrome, y captura a 320 px.
  - **Quedó fuera:** QR para el código (haría falta una librería o un generador propio sin poder verificarlo), TURN propio (Fase 2), confirmación del creador antes de aceptar a un dispositivo (cambia el diseño; ver `docs/seguridad.md`), fijar versiones de `xcaddy`/imágenes base, modo oscuro (el usuario eligió el fondo crema).
  - **Sin verificar en dispositivos reales:** escritura directa a disco con el selector de guardado real, borrado del archivo vacío al cancelar (`handle.remove`), corte de red real (ICE `disconnected`/`failed`), velocidad en Wi-Fi, móvil real e iOS, imagen de Caddy con DuckDNS.
- **Cuarta ronda (revisión completa y mejoras):**
  - **Arreglos:** `vitest.config.ts` era de otro proyecto y rompía `pnpm test` y `tsc`; ahora es una configuración propia (`passWithNoTests`). Los mensajes que llegaban por el canal antes de montar la sala se perdían: ahora se guardan en `net/peer.ts` y se reproducen (`replayEarly`). Los textos con muchos caracteres escapados se descartaban en silencio: trozos de 15.000 caracteres y `MAX_PARTS` 80 (`state/mensajes.ts`).
  - **Emparejamiento con confirmación:** el creador acepta o rechaza a quien quiere unirse (`pending`, `join-request`, `accept`, `reject`, `join-cancelled`; 60 s de límite, errores `rejected` y `no_answer`). Un miembro que vuelve a una sala emparejada entra directo; `join.direct` y `peer-joined.direct` indican que su canal sigue abierto y no se reempareja (si solo un lado lo conserva, el otro manda la señal `repair`).
  - **Servidor:** límite de 10 salas creadas por minuto y por IP (`allowCreate`) y línea con el total de rechazos por minuto, sin IPs.
  - **Docker:** imágenes por `@sha256:`, `caddy-dns/duckdns@v0.5.0` (la imagen de Caddy ya compila), `encode zstd gzip`, `BIND_IP` para publicar el 443 solo en la IP de la LAN y `react`, `react-dom`, `highlight.js` y `lucide-react` en `devDependencies` (la imagen final lleva solo `ws`).
  - **Cliente:** `files/resaltado.ts` (nuevo) separa highlight.js de `formatos.ts` y la pestaña Texto se carga aparte (`React.lazy`): el bundle principal baja de 402 KB a unos 285 KB. `state/mensajes.ts` (nuevo) contiene `parseMsg`; `ui/portapapeles.ts` unifica el copiado; confirmación al salir con transferencias en curso; aviso de guardado en memoria antes de descargar archivos grandes (`memoryNotice`).
  - **Funciones nuevas:** velocidad y tiempo restante; **Descargar todos** con una sola carpeta (`showDirectoryPicker`, sin pisar archivos existentes); miniaturas de imágenes (`files/miniatura.ts`, JPEG de 96 px en `file-add.thumb`, validado con `sanitizeThumb`); nombre editable del dispositivo (`hello`, `state/nombre.ts`, `localStorage`); botón **Vaciar mis textos**; contador en el título con la pestaña oculta; QR de la sala (`files/qr.ts`, generador propio sin dependencias, versiones 1 a 7, nivel M; el enlace `/#CÓDIGO` se une directamente).
  - **Modo rápido local:** `docker-compose.local.yml` (un solo contenedor, puerto 8080, sin Caddy ni DuckDNS ni `.env`) para usarla bajo demanda solo en la LAN. El modo con DuckDNS y HTTPS sigue disponible. Se descartó desplegarla en `pc1-personal` y en Vercel (no admite WebSockets ni procesos de larga vida).
  - **Descartado a propósito:** guardado en streaming por Service Worker para móviles (obligaría a relajar `worker-src` en la CSP y no es fiable en iOS), opción de quitar los STUN públicos y la Fase 2.
- Reconectar tras recargar: el token de la sala se guarda en `sessionStorage` y, al abrir la app, se intenta volver a esa sala.

## FASE 2 (solo cuando todo lo anterior esté terminado)

Se planificará aparte. Ideas acordadas: Cloudflare Tunnel en el mismo PC para entrar desde otras redes y un servidor TURN (coturn) en el mismo Docker.
