# REORG_REPORT: Transferir

Rama: `chore/agent-friendly-layout` (desde `dev`). Plan aprobado: `REORG_PLAN.md`.

## Commits

| Commit    | Fase  | Contenido                                                                                                                                   |
| --------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `99aa258` | 0     | Diagnóstico y plan (`REORG_PLAN.md`).                                                                                                       |
| `6110f48` | 1 y 2 | Estructura por feature y renombrado (en el mismo commit, porque el renombrado forma parte de los mismos `git mv`).                          |
| `9ee3c2c` | 3     | Contexto para el agente: `CLAUDE.md` reducido, `AGENTS.md` idéntico, mapa de features, arquitectura, runbooks, skills, `CLAUDE.md` locales. |
| `92b7cca` | 4     | `pnpm verify`, chequeo de arquitectura sin dependencias.                                                                                    |
| (este)    | 4     | Este informe.                                                                                                                               |

Antes de la rama hubo dos commits de CI (`182acd7` y `a74ce8d`) que no forman parte de la reorganización: scripts `lint` y `typecheck`, y el workflow de tests en PR.

## Tabla final `ruta_antigua -> ruta_nueva`

Todos los movimientos se hicieron con `git mv`. Ruta antigua = estado en `eed109d`.

| Ruta antigua                        | Ruta nueva                                         |
| ----------------------------------- | -------------------------------------------------- |
| `docs/preview-pantallas.html`       | `_archive/docs/preview-pantallas.html`             |
| `client/src/App.tsx`                | `client/src/app/App.tsx`                           |
| `client/src/ui/Header.tsx`          | `client/src/app/CabeceraPestanas.tsx`              |
| `client/src/index.css`              | `client/src/app/estilos-globales.css`              |
| `client/src/main.tsx`               | `client/src/app/main.tsx`                          |
| `client/src/ui/useAvisoTitulo.ts`   | `client/src/app/use-aviso-titulo.ts`               |
| `client/src/screens/Archivos.tsx`   | `client/src/archivos/PantallaArchivos.tsx`         |
| `client/src/ui/portapapeles.ts`     | `client/src/portapapeles/portapapeles.ts`          |
| `client/src/screens/Inicio.tsx`     | `client/src/sala/PantallaInicio.tsx`               |
| `client/src/screens/SalaCreada.tsx` | `client/src/sala/PantallaSalaCreada.tsx`           |
| `client/src/ui/QrCodigo.tsx`        | `client/src/sala/QrCodigo.tsx`                     |
| `client/src/net/peer.ts`            | `client/src/sala/conexion-webrtc.ts`               |
| `client/src/state/mensajes.ts`      | `client/src/sala/mensajes.ts`                      |
| `client/src/state/nombre.ts`        | `client/src/sala/nombre-dispositivo.ts`            |
| `client/src/files/qr.ts`            | `client/src/sala/qr-generador.ts`                  |
| `client/src/net/signaling.ts`       | `client/src/sala/senalizacion.ts`                  |
| `client/src/state/sala.ts`          | `client/src/sala/use-sala.ts`                      |
| `client/src/screens/Texto.tsx`      | `client/src/texto/PantallaTexto.tsx`               |
| `client/src/files/resaltado.ts`     | `client/src/texto/resaltado-sintaxis.ts`           |
| `client/src/files/formatos.ts`      | `client/src/transferencia/formatos.ts`             |
| `client/src/files/miniatura.ts`     | `client/src/transferencia/miniatura.ts`            |
| `client/src/files/transfer.ts`      | `client/src/transferencia/transferencia.ts`        |
| `client/src/files/chunker.ts`       | `client/src/transferencia/trocear-y-recomponer.ts` |
| `client/src/files/validar.ts`       | `client/src/transferencia/validar-entrada.ts`      |
| `server/limiter.ts`                 | `server/sala/limite-intentos.ts`                   |
| `server/rooms.ts`                   | `server/sala/salas.ts`                             |
| `shared/protocol.ts`                | `shared/protocolo/protocol.ts`                     |
| `shared/token.ts`                   | `shared/token/token.ts`                            |

Sin cambio: `server/index.ts` (entrada del build, decisión E), `client/src/index.css` ya tratado arriba, `client/vite.config.ts`, `client/index.html` (solo cambia la ruta de `main.tsx`).

Nombres nuevos: componentes en `PascalCase.tsx` y módulos `.ts` en kebab-case (decisión C). `App.tsx` conserva su nombre por ser componente.

## Archivos movidos a `_archive/`

- `_archive/docs/preview-pantallas.html`: no lo referencia ningún archivo del repo. Movido sin borrar (decisión H).

Nada más se ha borrado ni archivado.

## Actualizaciones que se pueden romper

- Imports: 15 archivos y 49 imports reescritos (script temporal, eliminado). `shared/` y `server/` actualizados.
- `client/index.html`: `/src/main.tsx` → `/src/app/main.tsx`.
- `docs/plan.md`: rutas del árbol, mapa de archivos y tareas actualizadas; las notas históricas apuntan a la ruta actual.
- `README.md`: sección "Estructura del proyecto" reescrita.
- `docs/seguridad.md`: rutas actualizadas.
- `CLAUDE.md`, `AGENTS.md`: reescritos; idénticos entre sí.
- Docker (`docker/Dockerfile`, `docker/Dockerfile.caddy`, `docker-compose*.yml`): no hacía falta cambiarlos. Dependen de `dist-server/index.js` y `client/dist`, y ambos no cambian. Verificado con `pnpm build` y `pnpm build:server`.
- `docs/arranque.md`: no contenía rutas de código; sin cambios.
- `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`: no referencian rutas movidas; sin cambios.
- Arranque: `pnpm start` levantado, `/health` responde 200 y la página sirve el bundle nuevo.

## Archivos que no se dividieron

Decisión F (aprobada): no dividir en esta reorganización. El chequeo de arquitectura los muestra como aviso.

| Archivo                                    | Líneas | Motivo                                                                                 |
| ------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `client/src/sala/use-sala.ts`              | 965    | Hook con estado compartido. Sin tests, dividirlo es arriesgado.                        |
| `client/src/app/App.tsx`                   | 555    | Dividir en componentes es mecánico, pero sin tests solo lo verifican `tsc` y el build. |
| `client/src/archivos/PantallaArchivos.tsx` | 532    | Igual que `App.tsx`.                                                                   |

`docs/plan.md` (511 líneas) tampoco se divide: es un plan con orden de tareas.

## Conflictos de documentación

- **`CLAUDE.md` y `AGENTS.md` se contradecían** (decisión A/B): título, una frase y la ruta de la carpeta (`proyectos/transferir/` frente a `transferir/`). Resuelto: son idénticos, y la ruta relativa es la única correcta.
- **`README.md` y `docs/arranque.md` se solapan** en el despliegue en casa. No encontré contradicciones directas, pero no lo he verificado línea a línea. Pendiente de revisión por el usuario.
- **`docs/plan.md` y las notas de "Cambios respecto al plan"** citan nombres antiguos en algunos sitios. Actualizados a la ruta actual; los cambios de diseño históricos no se han reescrito.

## Verificación

Antes (línea base, `eed109d` y antes de la reorganización):

| Comando                  | Resultado                                           |
| ------------------------ | --------------------------------------------------- |
| `pnpm test`              | Código 0, "No test files found" (no verifica nada). |
| `pnpm exec tsc --noEmit` | Sin errores.                                        |
| `pnpm build`             | OK.                                                 |
| `pnpm build:server`      | OK.                                                 |
| `pnpm format:check`      | OK.                                                 |
| Lint                     | No existía.                                         |

Después (`pnpm verify`, en `92b7cca`):

| Comando                                          | Resultado                                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `pnpm typecheck`                                 | Sin errores.                                                                               |
| `pnpm lint` (Prettier + chequeo de arquitectura) | Prettier OK. Arquitectura OK: 27 archivos, 3 avisos de tamaño (los de la tabla de arriba). |
| `pnpm test`                                      | Código 0, "No test files found" (igual que antes).                                         |
| `pnpm build`                                     | OK.                                                                                        |
| `pnpm build:server`                              | OK.                                                                                        |

Además, el chequeo de arquitectura se probó en una copia con infracciones a propósito (en `tmp/`, borrada): detectó un import entre features, un nombre genérico, un import de servidor a cliente y un import que sale de la raíz.

Los tests no se pueden comparar: no existen. La verificación real de este cambio son `tsc`, los builds y la comprobación de arranque.

## Cómo revertir todo

No se ha subido nada a `main`. Para volver al estado anterior sin afectar a `dev`:

```
git checkout dev
git branch -D chore/agent-friendly-layout
```

Si la rama ya se ha subido al remoto: `git push origin --delete chore/agent-friendly-layout`.

Para revertir solo la reorganización y conservar la rama: `git revert 92b7cca 9ee3c2c 6110f48 99aa258`, que deshace los commits en orden inverso sin reescribir la historia.
