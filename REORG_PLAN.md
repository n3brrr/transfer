# REORG_PLAN — Transferir

Fase 0 (diagnóstico). Nada se ha movido todavía. Rama: `chore/agent-friendly-layout` (creada desde `dev`).

## 1. Línea base (antes de tocar nada)

| Comando                        | Resultado                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm test`                    | Sale con código 0, pero dice **"No test files found"**. No verifica nada: no hay carpeta `tests/`. |
| `pnpm exec tsc --noEmit`       | Sin errores.                                                                                       |
| `pnpm build` (cliente, Vite)   | OK.                                                                                                |
| `pnpm build:server`            | OK (`dist-server/index.js`, 17 kB).                                                                |
| `pnpm format:check` (Prettier) | OK.                                                                                                |
| Lint                           | No existe. `CLAUDE.md` indica que no hay ESLint.                                                   |

Comando propuesto de verificación única: `pnpm verify` = `tsc --noEmit` + `format:check` + `test` + `build` + `build:server`. Hoy la red real son `tsc`, `build` y `format:check`.

## 2. Estructura actual (profundidad ≤ 4, solo código y docs)

```
transferir/
  client/
    index.html, vite.config.ts, public/favicon.svg
    src/
      App.tsx, main.tsx, index.css          (raíz de la app)
      screens/   Inicio, SalaCreada, Archivos, Texto      <- por capa técnica
      ui/        Header, QrCodigo, useAvisoTitulo, portapapeles
      net/       peer, signaling                          <- por capa técnica
      files/     chunker, transfer, validar, formatos, miniatura, qr, resaltado
      state/     sala (960 líneas), mensajes, nombre
  server/        index (456), rooms (175), limiter (70)
  shared/        protocol (63), token (48)
  docs/          plan.md, arranque.md, seguridad.md, preview-pantallas.html, capturas/
  docker/        Dockerfile, Dockerfile.caddy, Caddyfile
  CLAUDE.md, AGENTS.md, README.md, package.json, docker-compose*.yml, .env.example, ...
```

**Problema principal:** `client/src/` está organizado por capa técnica (`screens/`, `ui/`, `net/`, `files/`, `state/`). Una funcionalidad (p. ej. "enviar archivos") está repartida en 5 carpetas.

## 3. Dependencias entre módulos (resumen)

- `App.tsx` → `net/peer`, `net/signaling`, `state/sala`, `screens/*`, `ui/*`, `shared/*`.
- `state/sala.ts` (el centro) → `net/peer`, `files/transfer`, `files/validar`, `files/miniatura`, `state/mensajes`, `state/nombre`, `shared/*`.
- `screens/Archivos.tsx` → `files/transfer`, `files/validar`, `state/sala`.
- `screens/Texto.tsx` → `files/formatos`, `files/resaltado`, `files/transfer`, `state/sala`, `ui/portapapeles`.
- `screens/SalaCreada.tsx` → `ui/QrCodigo`, `ui/portapapeles`, `shared/token`.
- `files/validar.ts` → `files/formatos`, `files/miniatura`. `state/mensajes.ts` → `files/validar`.
- `server/index.ts` → `server/rooms`, `server/limiter`, `shared/*`. `server/rooms.ts` → `shared/token`.
- `shared/protocol.ts` y `shared/token.ts` no importan nada.

**Ciclo a nivel de feature:** `state/sala.ts` (núcleo) depende de `files/*` (motor de transferencia), y las pantallas `Archivos`/`Texto` dependen de `state/sala`. Si las features se separan tal cual, aparece un ciclo. Por eso el motor de transferencia tiene que salir a su propia carpeta compartida (ver §4).

**Sin huérfanos.** Los tres archivos sin importador son puntos de entrada: `client/src/main.tsx` (lo carga `index.html`), `client/src/index.css` (lo importa `main.tsx`) y `server/index.ts` (entrada de `build:server` y `start`).

## 4. Estructura propuesta

```
client/src/
  app/          arranque y cáscara de la app
    main.tsx, app-principal.tsx, estilos-globales.css, cabecera-pestanas.tsx, use-aviso-titulo.ts
  sala/         emparejar dispositivos y estado de la sala (núcleo)
    pantalla-inicio.tsx, pantalla-sala-creada.tsx, qr-codigo.tsx, qr-generador.ts
    senalizacion.ts, conexion-webrtc.ts, use-sala.ts, mensajes.ts, nombre-dispositivo.ts
  archivos/     pantalla de archivos (feature)
    pantalla-archivos.tsx
  texto/        pantalla de texto (feature)
    pantalla-texto.tsx, resaltado-sintaxis.ts
  transferencia/  motor compartido: trocear, enviar, validar, formatos, miniaturas
    transferencia.ts, trocear-y-recomponer.ts, validar-entrada.ts, formatos.ts, miniatura.ts
  portapapeles/
    portapapeles.ts

server/
  index.ts                       (entrada; sin cambios de nombre, ver decisión E)
  sala/
    salas.ts, limite-intentos.ts

shared/
  protocolo/protocol.ts
  token/token.ts
```

Reglas de dependencia propuestas: `app/` → cualquiera. `archivos/` y `texto/` → `sala/`, `transferencia/`, `portapapeles/`. `sala/` → `transferencia/`, `portapapeles/`, `shared/`. `transferencia/` → `shared/`. Ningún feature importa de otro feature. Esto se puede comprobar con un script (ver decisión D).

## 5. Tabla `ruta_actual -> ruta_nueva` (propuesta)

| Ruta actual                         | Ruta nueva propuesta                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `client/src/main.tsx`               | `client/src/app/main.tsx`                                                      |
| `client/src/App.tsx`                | `client/src/app/app-principal.tsx`                                             |
| `client/src/index.css`              | `client/src/app/estilos-globales.css`                                          |
| `client/src/ui/Header.tsx`          | `client/src/app/cabecera-pestanas.tsx`                                         |
| `client/src/ui/useAvisoTitulo.ts`   | `client/src/app/use-aviso-titulo.ts`                                           |
| `client/src/screens/Inicio.tsx`     | `client/src/sala/pantalla-inicio.tsx`                                          |
| `client/src/screens/SalaCreada.tsx` | `client/src/sala/pantalla-sala-creada.tsx`                                     |
| `client/src/ui/QrCodigo.tsx`        | `client/src/sala/qr-codigo.tsx`                                                |
| `client/src/files/qr.ts`            | `client/src/sala/qr-generador.ts`                                              |
| `client/src/net/signaling.ts`       | `client/src/sala/senalizacion.ts`                                              |
| `client/src/net/peer.ts`            | `client/src/sala/conexion-webrtc.ts`                                           |
| `client/src/state/sala.ts`          | `client/src/sala/use-sala.ts`                                                  |
| `client/src/state/mensajes.ts`      | `client/src/sala/mensajes.ts`                                                  |
| `client/src/state/nombre.ts`        | `client/src/sala/nombre-dispositivo.ts`                                        |
| `client/src/screens/Archivos.tsx`   | `client/src/archivos/pantalla-archivos.tsx`                                    |
| `client/src/screens/Texto.tsx`      | `client/src/texto/pantalla-texto.tsx`                                          |
| `client/src/files/resaltado.ts`     | `client/src/texto/resaltado-sintaxis.ts`                                       |
| `client/src/files/transfer.ts`      | `client/src/transferencia/transferencia.ts`                                    |
| `client/src/files/chunker.ts`       | `client/src/transferencia/trocear-y-recomponer.ts`                             |
| `client/src/files/validar.ts`       | `client/src/transferencia/validar-entrada.ts`                                  |
| `client/src/files/formatos.ts`      | `client/src/transferencia/formatos.ts`                                         |
| `client/src/files/miniatura.ts`     | `client/src/transferencia/miniatura.ts`                                        |
| `client/src/ui/portapapeles.ts`     | `client/src/portapapeles/portapapeles.ts`                                      |
| `server/rooms.ts`                   | `server/sala/salas.ts`                                                         |
| `server/limiter.ts`                 | `server/sala/limite-intentos.ts`                                               |
| `shared/protocol.ts`                | `shared/protocolo/protocol.ts`                                                 |
| `shared/token.ts`                   | `shared/token/token.ts`                                                        |
| `server/index.ts`                   | sin cambio (ver decisión E)                                                    |
| `docs/preview-pantallas.html`       | `_archive/docs/preview-pantallas.html` (candidato, no referenciado en el repo) |

Todos los movimientos van con `git mv`. Imports, `client/index.html` (apunta a `/src/main.tsx`), `vite.config.ts`, `tsconfig.json`, `docker/*`, `docker-compose*.yml`, `.dockerignore`, `package.json` y la documentación se actualizan en el mismo commit que el lote.

## 6. Archivos de más de 500 líneas

| Archivo                           | Líneas | Propuesta                                                                                                                                                                   |
| --------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `client/src/state/sala.ts`        | 960    | **No dividir en esta reorganización.** Es un hook con estado compartido; dividirlo a ciegas sin tests es arriesgado. Candidato a extraer lógica pura en una fase posterior. |
| `client/src/App.tsx`              | 554    | Dividir en pantallas/componentes solo si apruebas. El corte es mecánico, pero sin tests lo verifica solo `tsc` y el build.                                                  |
| `client/src/screens/Archivos.tsx` | 531    | Igual que `App.tsx`.                                                                                                                                                        |
| `client/src/screens/Texto.tsx`    | 442    | Por debajo del límite, no tocar.                                                                                                                                            |
| `docs/plan.md`                    | 511    | Es documento de plan con orden de tareas; no dividir.                                                                                                                       |

## 7. Nombres genéricos

- Ninguno de la lista prohibida (`utils`, `helpers`, `misc`, `common`, `temp`, `new`, `final`, `old`, `v2`) aparece en el repo.
- Nombres poco descriptivos que cambio en la tabla: `state/nombre.ts` (→ `nombre-dispositivo.ts`), `files/chunker.ts` (→ `trocear-y-recomponer.ts`), `files/validar.ts` (→ `validar-entrada.ts`), `ui/Header.tsx` (→ `cabecera-pestanas.tsx`), `files/qr.ts` (→ `qr-generador.ts`). Confirmaré su contenido real en la Fase 2 antes de renombrarlos.
- `index.ts`, `main.tsx`, `index.css`: nombres de entrada convencionales. Los mantengo (ver decisión E).

## 8. Documentación: duplicados y contradicciones

1. **`CLAUDE.md` y `AGENTS.md` deberían ser idénticos** (la regla de ambos lo exige), pero no lo son. Diferencias: el título, la frase "Antes de empezar una tarea **sin contexto**", y la ruta de la carpeta: `proyectos/transferir/` en `CLAUDE.md` frente a `transferir/` en `AGENTS.md`. **Contradicción, no resuelta:** no elijo cuál es correcta.
2. **`README.md` tiene una sección "Estructura del proyecto"** (línea 162) que probablemente quedará obsoleta tras la reorganización. Sin verificar en detalle.
3. **`docs/arranque.md` y la sección "Despliegue en casa" del `README.md`** se solapan. No he encontrado contradicciones directas, pero tampoco lo he verificado línea a línea.
4. **`docs/preview-pantallas.html`** no lo referencia nadie. Candidato a `_archive/`.
5. **`CLAUDE.md` y la tarea de reorganización chocan** (ver decisiones A y B): la tarea pide reescribirlo a menos de 150 líneas, pero hoy contiene las reglas de flujo de trabajo del proyecto.

## 9. Riesgos

1. **Sin tests, la red de seguridad es `tsc` + build + `format:check`.** Un renombrado que rompa algo en tiempo de ejecución (una ruta de import dinámica, un nombre de archivo en un string) puede pasar desapercibido. Mitigación: buscar rutas como texto además de compilar.
2. **Rutas en Docker y despliegue:** `docker/Dockerfile`, `docker/Dockerfile.caddy`, `docker-compose.yml`, `docker-compose.local.yml`, `.dockerignore`. Mover `server/` o `client/` las rompe. Además, `docs/arranque.md` contiene instrucciones para el PC de casa.
3. **`docs/plan.md` y su "Mapa de archivos"** fijan los nombres de archivo. Renombrar obliga a actualizarlos en el mismo commit (lo exige `CLAUDE.md`).
4. **Ciclo de dependencias** `sala` ↔ `archivos`/`texto` si no se mueve el motor a `transferencia/`. La propuesta lo evita, pero hay que comprobarlo con el script de la Fase 4.
5. **`git mv` y el historial:** `git mv` conserva el historial de archivos que apenas cambian. Los que cambian mucho de contenido no lo mantienen de forma útil en `git blame`. `.git-blame-ignore-revs` usa hashes, no rutas, así que no se rompe.
6. **Convención de nombres:** la tarea pide kebab-case para todo. El código actual mezcla `PascalCase` (componentes `.tsx`) y `camelCase`/minúsculas (`.ts`). Ver decisión C.

## 10. Decisiones que necesito de ti antes de la Fase 1

- **A. Renombrar y mover.** `CLAUDE.md` dice "no renombrar nada" y que los nombres los fija `plan.md`. La tarea pide renombrar. ¿Apruebas los renombrados de §5 y actualizo `plan.md`, `CLAUDE.md` y `AGENTS.md` en el mismo commit? _Recomendación: sí._
- **B. `CLAUDE.md`.** ¿Lo reescribo a <150 líneas según la tarea y muevo las reglas de flujo de trabajo (tareas, git, idioma) a `docs/flujo-de-trabajo.md`, o prefieres conservar el contenido actual? _Recomendación: mover las reglas a `docs/` y dejar en `CLAUDE.md` solo lo pedido._
- **C. Convención de nombres.** ¿kebab-case para todo (como pide la tarea) o mantengo `PascalCase` para componentes `.tsx`? _Recomendación: kebab-case para los `.ts` y `PascalCase` para componentes, que es lo que ya usa el proyecto._
- **D. Tests y reglas automáticas.** `CLAUDE.md` dice que los tests van en `tests/` (nunca junto al código) y que están aplazados por ti. La tarea pide un test junto a cada archivo y una regla que lo exija. Eso choca con las dos cosas. Además, el proyecto no tiene ESLint, y la regla "sin imports entre features" necesitaría una dependencia nueva. _Recomendación: mantener `tests/`; no crear tests en esta reorganización; y, en lugar de ESLint, un script `scripts/check-arquitectura.mjs` sin dependencias que compruebe las reglas de §4._
- **E. Entrada del servidor.** `server/index.ts` está referido en `package.json`, `vite --ssr` y `Dockerfile`. ¿Lo dejo como está? _Recomendación: sí, es una convención de entrada y renombrarlo no aporta mucho._
- **F. Archivos grandes.** ¿Divido `App.tsx` y `Archivos.tsx` en esta reorganización, sabiendo que solo se verifican con `tsc` y build, o lo dejo para más adelante? _Recomendación: dejarlo para más adelante._
- **G. Rama y destino.** `CLAUDE.md` dice que se trabaja en `dev`, y que `main` solo recibe merges cuando lo digas tú. Yo he creado `chore/agent-friendly-layout` desde `dev`, como pide la tarea. ¿Confirmas que la rama se queda sin merge hasta que lo digas tú? _Recomendación: sí._
- **H. `docs/preview-pantallas.html`.** ¿Lo muevo a `_archive/docs/`? _Recomendación: sí, tras confirmar que no lo usas._

## 11. Próximos pasos (tras tu aprobación)

- Fase 1: mover por lotes con `git mv` y actualizar imports, `index.html`, Docker, `plan.md` y documentación. Build y `tsc` después de cada lote.
- Fase 2: renombrados de §5 y §7. Confirmar el contenido de los archivos con nombres poco claros antes de renombrarlos.
- Fase 3: `CLAUDE.md` nuevo, `docs/feature-map.md`, `docs/architecture.md`, `docs/runbooks/`, y skills en `.claude/skills/`.
- Fase 4: script de verificación única, chequeo de dependencias entre features (si apruebas D), archivo `_archive/`, y `REORG_REPORT.md` con la comparación contra la línea base de §1.
