# CLAUDE.md

Guía para Claude Code en este repositorio. `AGENTS.md` tiene exactamente el mismo contenido: si cambias uno, cambia el otro igual.

## Qué es

Web app personal para pasar archivos y textos entre 2 dispositivos emparejados con un token. Los datos van directos por WebRTC; el servidor solo reenvía señalización (SDP/ICE) y no guarda nada.

Stack: TypeScript en todo. Cliente: Vite + React + Tailwind. Servidor: Node 24 + `ws`. Tests: Vitest (aplazados). Despliegue: Docker Compose + Caddy en el PC del usuario.

## Verificación y comandos

- **Comando único:** `pnpm verify` (tipos, formato, arquitectura, tests y builds). Ejecutarlo antes de cada commit.
- Por partes: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm build:server`.
- Desarrollo: `pnpm dev:server` (puerto 8080) y `pnpm dev:client` (Vite con proxy de `/ws`). `pnpm start` sirve `client/dist` tras `pnpm build`.
- Gestor: **pnpm**. Nunca `npm` ni `yarn`. Nada global sin preguntar.

## Mapa de carpetas

```
shared/
  protocolo/protocol.ts   contrato cliente↔servidor (ToServer/FromServer) y dispositivo↔dispositivo (PeerMsg)
  token/token.ts          generar y normalizar tokens (cliente y servidor)
server/
  index.ts                HTTP estático, /health, upgrade WebSocket, CSP
  sala/salas.ts           salas con token, caducidad y sweep()
  sala/limite-intentos.ts intentos fallidos por IP
client/src/
  app/                    arranque, navegación entre pantallas, cabecera
  sala/                   emparejar dispositivos, señalización, WebRTC, estado de la sala (núcleo)
  archivos/               pantalla Archivos
  texto/                  pantalla Texto
  transferencia/          motor compartido: troceado, envío, validación, formatos, miniaturas
  portapapeles/           copiar al portapapeles
tests/                    todos los tests (aplazados)
docker/                   Dockerfiles y Caddyfile
docs/                     plan, arquitectura, mapa de features, flujo de trabajo, runbooks
```

Mapa de features con dependencias: `docs/feature-map.md`. Decisiones y su porqué: `docs/architecture.md`.

## Reglas imprescindibles

- **Plan:** seguir `docs/plan.md` en orden. Una tarea a la vez. Marcar `- [x]` en el mismo commit.
- **Alcance:** tocar solo los archivos de la tarea, con rutas exactas. No renombrar ni mover sin aprobación. Ante una decisión que falta o un fallo repetido: parar y preguntar.
- **Dependencias:** no añadir ninguna que no esté en el plan sin preguntar.
- **Git:** trabajar en `dev` (o en la rama de trabajo que indique el usuario). Nunca commit directo en `main`; el merge a `main` solo lo pide el usuario. Añadir archivos por ruta, nunca `git add .` ni `git add -A`. Conventional Commits en español, máximo 72 caracteres. Push tras verificar.
- **Temporales:** scripts y pruebas en `tmp/` (ignorado por git). Vaciarla antes del commit.
- **Tests:** no crear archivos de test hasta que el usuario lo pida. Cuando existan, van en `tests/`, nunca junto al código.
- **Entrada no fiable:** lo que llega del otro dispositivo se valida siempre (`client/src/transferencia/validar-entrada.ts`). Mensajes nuevos: añadir el tipo en `shared/protocolo/protocol.ts` y validarlo al recibir.
- **Privacidad:** el servidor no guarda ni registra contenido. No loguear tokens completos. Secretos solo en `.env`.
- **Red:** el puerto 443 es solo para la red de casa. Nunca redirigir puertos ni usar DMZ/UPnP (`docs/seguridad.md`).
- **Interfaz:** textos en español y cortos. Colores solo del tema. Debe verse bien a 360 px. `localStorage` y `sessionStorage` siempre dentro de `try/catch`.
- **Código:** lo más simple posible. Componentes `PascalCase.tsx`; módulos `.ts` en kebab-case.
- **Política de seguridad:** si se añade al cliente algo que cargue recursos externos o estilos en línea, ajustar la CSP en `server/index.ts`.

Las reglas completas (flujo por tareas, git, tests, entorno) están en `docs/flujo-de-trabajo.md`.

## Documentación

- `docs/flujo-de-trabajo.md`: reglas completas de trabajo, git y tests.
- `docs/plan.md`: plan por pantallas, con el mapa de archivos.
- `docs/architecture.md`: decisiones y restricciones con su porqué.
- `docs/feature-map.md`: features, carpetas, tests y dependencias.
- `docs/runbooks/`: reproducir bugs, verificar cambios y depurar.
- `docs/arranque.md`: cómo arrancarlo en casa. `docs/seguridad.md`: análisis de seguridad y riesgos aceptados.
- `.claude/skills/`: procedimientos repetibles (verificar cambios, añadir un mensaje de protocolo, añadir una feature).

## Estado actual

- Fases 0 a 5.1 escritas y probadas. Lo que cambió respecto al plan está en "Cambios respecto al plan" de `docs/plan.md`.
- Tareas 5.2 (puesta en marcha) y 5.3 (prueba final) son manuales.
- Tests aplazados por indicación del usuario.
