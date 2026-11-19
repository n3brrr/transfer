# Transferir

Web app personal para pasar archivos y textos entre 2 dispositivos emparejados con un token. Los datos van directos por WebRTC; el servidor solo hace de puente y no guarda nada.

> Este archivo y `CLAUDE.md` tienen las mismas reglas. Si cambias uno, cambia el otro igual.

## Cómo se hace

- Seguir `docs/plan.md` en orden: base → pantalla 1 → pantalla 2 → pantalla 3 → pantalla 4 → despliegue.
- Marcar cada paso `- [x]` en el plan al terminarlo, en el mismo commit.
- No saltarse tareas ni adelantar la Fase 2.
- Si algo del plan no funciona o falta una decisión, parar y preguntar. No improvisar cambios de diseño.
- **Estado actual:** las fases 0 a 5.1 están escritas y probadas; lo que cambió respecto al plan está en su sección "Cambios respecto al plan". Git ya está activo (rama `dev`, remoto `origin`): se hace commit por grupos de archivos y push tras verificar cada bloque. **Los tests están aplazados** por indicación del usuario: no crear archivos de test hasta que lo pida (entonces aplica la sección Tests).
- Las pruebas de navegador (Chrome headless, capturas) gastan muchos tokens: hacerlas solo cuando el usuario las pida o en una única pasada final, nunca en cada cambio.

## Reglas para cualquier agente o modelo

Aplican siempre, sea Claude u otro modelo.

**Antes de empezar una tarea sin contexto**

1. Leer este archivo entero.
2. Leer en `docs/plan.md` la tarea completa: su lista **Archivos**, su bloque **Consume/Produce** y todos sus pasos.
3. Mirar en el "Mapa de archivos" del plan qué tarea creó cada archivo que vas a tocar.
4. Leer los archivos existentes que la tarea modifica antes de editarlos.

**Durante la tarea**

- Una tarea a la vez. No empezar la siguiente hasta que la actual esté terminada, con commit y subida a `dev`.
- Crear y modificar **solo** los archivos que indica la tarea, con la ruta exacta del plan. Además, `docs/plan.md` para marcar casillas.
- Si hace falta un archivo o dependencia que el plan no lista: parar y preguntar.
- Usar exactamente los nombres, tipos y firmas del plan. No renombrar nada.
- No inventar APIs ni opciones de librerías: comprobarlo ejecutando el código o los tests.
- Si algo falla dos veces seguidas de la misma forma: parar y explicar qué pasa, sin seguir probando a ciegas.
- No borrar ni reescribir archivos que no sean de la tarea, ni código que funcione, sin preguntar.

**Al terminar una tarea**

1. Ejecutar `pnpm test` y `pnpm exec tsc --noEmit`. Si es interfaz, comprobarla a mano.
2. Borrar todo lo temporal (ver "Archivos temporales").
3. Marcar las casillas en `docs/plan.md`.
4. Commit y `git push origin dev`.
5. Informar en pocas líneas: tarea (p. ej. "Tarea 2.1"), archivos creados/modificados con su ruta, comandos ejecutados y su resultado, y hash del commit.

**Si se cambia una decisión**

- Actualizar `docs/plan.md` (y este archivo y `AGENTS.md` si afecta a las reglas) en el mismo commit, citando qué tarea cambia.

## Carpeta de trabajo

- Todo se hace dentro de la carpeta del proyecto (`transferir/`). Rutas siempre relativas a ella.
- No leer, crear ni modificar nada fuera de ella. Única excepción: lo que sea imprescindible y no se pueda hacer de otra forma (caché de pnpm, Docker, configuración de Windows de la Tarea 5.2), y siempre avisando antes de qué y por qué.
- No instalar nada global (`pnpm add -g`, etc.) sin preguntar.

## Archivos temporales

- Cualquier prueba, script o carpeta temporal va en `tmp/` dentro del proyecto (está en `.gitignore`).
- Borrarlo en cuanto deje de hacer falta y siempre antes del commit. Al acabar cada tarea, `tmp/` debe quedar vacía o no existir.
- Nunca crear archivos sueltos de prueba en la raíz ni en `client/`, `server/`, `shared/` o `tests/`.
- Comandos de borrado solo dentro de `tmp/`. Nada de `rm -rf` fuera, `git clean` ni `git reset --hard`.

## Pila

- TypeScript en todo.
- Cliente: Vite + React + Tailwind. Servidor: Node 24 + `ws`; en desarrollo se ejecuta con `tsx` y en Docker se compila a `dist-server/` con `pnpm build:server`. Tests: Vitest.
- Despliegue: Docker Compose + Caddy (plugin DuckDNS) en el PC del usuario.
- Iconos: `lucide-react` (la única dependencia añadida después del plan, a petición del usuario).
- Formato: `prettier` (dependencia de desarrollo añadida a petición del usuario).
- No añadir dependencias que no estén en el plan sin preguntar.

## Arquitectura (visión de conjunto)

- **Tres capas.** El servidor (`server/`) solo empareja y reenvía `signal` (SDP/ICE) entre los dos dispositivos de una sala; nunca ve contenido. Los datos van por un `RTCDataChannel` abierto por `client/src/sala/conexion-webrtc.ts` (`connectPeer`; quien se une ofrece, quien espera responde).
- **Contrato único en `shared/protocolo/protocol.ts`:** `ToServer`/`FromServer` (cliente↔servidor, WebSocket en `/ws`) y `PeerMsg` (dispositivo↔dispositivo, JSON; los bloques de archivo van en binario). Cualquier mensaje nuevo se añade ahí y se valida en recepción.
- **`client/src/sala/use-sala.ts` (`useSala`) es el centro del cliente:** une señalización, canal WebRTC, lista compartida de archivos/textos, colas de descarga, latido ping/pong, reanudación y reconexión. Las pantallas (`*/Pantalla*.tsx`) solo pintan lo que devuelve.
- **Transferencia de archivos:** `transferencia/trocear-y-recomponer.ts` trocea/recompone; `transferencia/transferencia.ts` hace el control de flujo (ventana de 8 MB con `file-ack` del receptor) y la escritura a disco (selector de guardado, o memoria con límites como respaldo); `transferencia/validar-entrada.ts` sanea todo lo que llega del otro lado.
- **Servidor:** `sala/salas.ts` (salas con token, caducidad y `sweep()`), `sala/limite-intentos.ts` (intentos fallidos por IP), `index.ts` (HTTP estático desde `client/dist`, `/health`, upgrade WebSocket, CSP). En producción se compila a `dist-server/` y corre en Docker detrás de Caddy.
- **Tests aplazados** (ver "Estado actual"): los pasos de `tests/` quedan en pausa hasta que el usuario lo pida. Para un solo test, cuando existan: `pnpm exec vitest run tests/<archivo>.test.ts`.

## Sistema de archivos

```
transferir/
  CLAUDE.md, AGENTS.md    reglas (idénticas)
  docs/plan.md            plan por pantallas
  docs/arranque.md        cómo instalarlo y arrancarlo en casa
  docs/seguridad.md       análisis de seguridad y riesgos aceptados
  package.json            único para todo el proyecto
  shared/                 código común cliente/servidor (protocolo, token)
  server/                 salas, límite de intentos, HTTP + WebSocket
  client/src/
    app/                  arranque, navegación, cabecera
    sala/                 emparejar y estado de la sala (núcleo)
    archivos/, texto/     una pantalla por feature
    transferencia/        motor: troceado, envío, validación
  tests/                  todos los tests, nada más
  docker/                 Dockerfiles y Caddyfile
  docker-compose.yml, .env.example
  tmp/                    temporal, ignorado por git, se vacía al acabar cada tarea
```

- La lista completa de archivos, con la tarea que crea cada uno y las que lo modifican, está en el "Mapa de archivos" de `docs/plan.md`.

- Un archivo, una responsabilidad. Si crece mucho, dividir.
- Nombres de archivos y funciones: los que fija el plan.

## Comandos

- Gestor de paquetes: **pnpm**. Nunca `npm` ni `yarn`.
- Herramientas puntuales: `pnpm dlx` o `pnpm exec` (si no queda otra, `npx`).
- Desarrollo: `pnpm dev:server` (puerto 8080) y `pnpm dev:client` (Vite, proxy de `/ws` al servidor). `pnpm start` sirve `client/dist` tras `pnpm build`.
- `pnpm dev:server` · `pnpm dev:client` · `pnpm build` · `pnpm start` · `pnpm test`
- Comprobar tipos: `pnpm exec tsc --noEmit`
- Formato: Prettier (`.prettierrc.json`). `pnpm format` formatea y `pnpm format:check` comprueba. Formatear antes de cada commit. No hay ESLint.

## Git

**Ramas**

- `main`: solo código estable. Nunca se trabaja ni se hace commit directo en ella.
- `dev`: aquí se trabaja y se sube todo.
- Merge `dev` → `main` **solo cuando el usuario lo diga**: `git checkout main && git merge --no-ff dev && git push origin main`, y volver a `dev`.

**Cuándo hacer commit**

- En cuanto un archivo o grupo de archivos funciona, no al terminar una pantalla entera.
- "Funciona" = `pnpm test` pasa, `pnpm exec tsc --noEmit` sin errores y, si es interfaz, comprobado a mano.
- Un commit = un cambio lógico. No mezclar cosas sin relación.
- Después de cada commit: `git push origin dev`. Si no hay remoto configurado, avisar al usuario.

**Formato del mensaje** (Conventional Commits, descripción en español, en imperativo, sin punto final, máx. 72 caracteres):

```
feat(server): añadir salas con token y caducidad
fix(client): evitar doble envío al pulsar Unirme
test(chunker): cubrir archivos de 0 bytes
chore: configurar Vitest
docs(plan): marcar tareas de la pantalla 1
```

Tipos: `feat`, `fix`, `test`, `refactor`, `style`, `docs`, `chore`, `build`. Ámbitos: `server`, `client`, `shared`, `docker`, `plan`.

**Prohibido**

- `git push --force`, `--no-verify`, reescribir historia ya subida.
- Commit de `.env`, `node_modules`, `dist`, `tmp/` o secretos.
- `git add .` o `git add -A`: añadir los archivos por su ruta.
- Commit con tests rotos.

## Reglas de código

- Lo más simple posible. Sin abstracciones "por si acaso".
- Comentarios pocos, en español, solo donde algo no sea obvio.
- Textos de la interfaz en español, cortos.
- Colores solo desde el tema: `crema #faebd4`, `tinta #3b2a1a`, `acento #c8643c`, `superficie #fff8ec`, `borde #d9c19a`, `ok #5a9a5a`.
- La interfaz debe verse bien en móvil (ancho 360 px) y en PC.
- `localStorage`/`sessionStorage` siempre dentro de `try/catch`.

## Tests

- Pocos y solo de lo importante: salas/token y trocear/recomponer archivos.
- Todos en `tests/`. Nunca junto al código.
- Si un bug importante aparece, añadir un test que lo cubra.

## Seguridad y datos

- El servidor no guarda contenido ni lo registra en consola. Nada de base de datos.
- No registrar tokens completos en logs.
- Secretos (token de DuckDNS) solo en `.env`; en el repo, `.env.example` sin valores.
- Todo lo de una sesión se borra al cerrarla.
- Lo que llega del otro dispositivo por el canal WebRTC es entrada **no fiable**: se valida siempre (tipos, tamaños, ids, longitudes) y los nombres de archivo se sanean (`client/src/transferencia/validar-entrada.ts`) antes de usarlos.
- El servidor pone la política de seguridad (CSP y demás cabeceras) en `server/index.ts`. Si se añade algo al cliente que cargue recursos externos, scripts o estilos en línea, hay que ajustarla y comprobar la consola del navegador.
- El puerto 443 es solo para la red de casa: nunca redirigir puertos en el router ni usar DMZ/UPnP. Ver `docs/seguridad.md`.

## Entorno

- Windows. Saltos de línea `LF` (`.gitattributes` con `* text=auto eol=lf`) para que Docker no falle.
- Solo se instala software en el PC del usuario, nunca en los otros dispositivos.
