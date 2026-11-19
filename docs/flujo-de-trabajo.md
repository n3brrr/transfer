# Flujo de trabajo

Reglas para cualquier agente o persona que cambie el proyecto. Las reglas imprescindibles resumidas están en `CLAUDE.md`; aquí va el detalle.

## Cómo se hace

- Seguir `docs/plan.md` en orden: base → pantalla 1 → pantalla 2 → pantalla 3 → pantalla 4 → despliegue.
- Marcar cada paso `- [x]` en el plan al terminarlo, en el mismo commit.
- No saltarse tareas ni adelantar la Fase 2.
- Si algo del plan no funciona o falta una decisión, parar y preguntar. No improvisar cambios de diseño.
- **Estado actual:** las fases 0 a 5.1 están escritas y probadas; lo que cambió respecto al plan está en su sección "Cambios respecto al plan". Git está activo (rama `dev`, remoto `origin`): se hace commit por grupos de archivos y push tras verificar cada bloque. **Los tests están aplazados** por indicación del usuario: no crear archivos de test hasta que lo pida (entonces aplica la sección Tests).
- Las pruebas de navegador (Chrome headless, capturas) gastan muchos tokens: hacerlas solo cuando el usuario las pida o en una única pasada final, nunca en cada cambio.

## Reglas para cualquier agente o modelo

Aplican siempre, sea Claude u otro modelo.

**Antes de empezar una tarea**

1. Leer `CLAUDE.md` y este archivo.
2. Leer en `docs/plan.md` la tarea completa: su lista **Archivos**, su bloque **Consume/Produce** y todos sus pasos.
3. Mirar en el "Mapa de archivos" del plan qué tarea creó cada archivo que vas a tocar.
4. Leer los archivos existentes que la tarea modifica antes de editarlos.
5. Para saber dónde está una feature, usar `docs/feature-map.md`.

**Durante la tarea**

- Una tarea a la vez. No empezar la siguiente hasta que la actual esté terminada, con commit y subida a `dev`.
- Crear y modificar **solo** los archivos que indica la tarea, con la ruta exacta del plan. Además, `docs/plan.md` para marcar casillas.
- Si hace falta un archivo o dependencia que el plan no lista: parar y preguntar.
- Usar exactamente los nombres, tipos y firmas del plan. No renombrar nada sin aprobación.
- No inventar APIs ni opciones de librerías: comprobarlo ejecutando el código o los tests.
- Si algo falla dos veces seguidas de la misma forma: parar y explicar qué pasa, sin seguir probando a ciegas.
- No borrar ni reescribir archivos que no sean de la tarea, ni código que funcione, sin preguntar.

**Al terminar una tarea**

1. Ejecutar `pnpm verify`. Si es interfaz, comprobarla a mano.
2. Borrar todo lo temporal (ver "Archivos temporales").
3. Marcar las casillas en `docs/plan.md`.
4. Commit y `git push origin dev`.
5. Informar en pocas líneas: tarea (p. ej. "Tarea 2.1"), archivos creados/modificados con su ruta, comandos ejecutados y su resultado, y hash del commit.

**Si se cambia una decisión**

- Actualizar `docs/plan.md` (y `CLAUDE.md` y `AGENTS.md` si afecta a las reglas) en el mismo commit, citando qué tarea cambia.

## Carpeta de trabajo

- Todo se hace dentro de la carpeta del proyecto. Rutas siempre relativas a ella.
- No leer, crear ni modificar nada fuera de ella. Única excepción: lo que sea imprescindible y no se pueda hacer de otra forma (caché de pnpm, Docker, configuración de Windows de la Tarea 5.2), y siempre avisando antes de qué y por qué.
- No instalar nada global (`pnpm add -g`, etc.) sin preguntar.

## Archivos temporales

- Cualquier prueba, script o carpeta temporal va en `tmp/` dentro del proyecto (está en `.gitignore`).
- Borrarlo en cuanto deje de hacer falta y siempre antes del commit. Al acabar cada tarea, `tmp/` debe quedar vacía o no existir.
- Nunca crear archivos sueltos de prueba en la raíz ni en `client/`, `server/`, `shared/` o `tests/`.
- Comandos de borrado solo dentro de `tmp/`. Nada de `rm -rf` fuera, `git clean` ni `git reset --hard`.

## Comandos

- Gestor de paquetes: **pnpm**. Nunca `npm` ni `yarn`.
- Herramientas puntuales: `pnpm dlx` o `pnpm exec` (si no queda otra, `npx`).
- Desarrollo: `pnpm dev:server` (puerto 8080) y `pnpm dev:client` (Vite, proxy de `/ws` al servidor). `pnpm start` sirve `client/dist` tras `pnpm build`.
- `pnpm verify` (tipos, formato, arquitectura, tests y builds) · `pnpm test` · `pnpm lint` · `pnpm typecheck` · `pnpm build` · `pnpm build:server` · `pnpm start`.
- Formato: Prettier (`.prettierrc.json`). `pnpm format` formatea. Formatear antes de cada commit.

## Git

**Ramas**

- `main`: solo código estable. Nunca se trabaja ni se hace commit directo en ella.
- `dev`: aquí se trabaja y se sube todo.
- Ramas de trabajo puntuales (p. ej. `chore/...`, `test/...`) salen de `dev` cuando el usuario lo pide.
- Merge `dev` → `main` **solo cuando el usuario lo diga**.

**Cuándo hacer commit**

- En cuanto un archivo o grupo de archivos funciona, no al terminar una pantalla entera.
- "Funciona" = `pnpm verify` pasa y, si es interfaz, comprobado a mano.
- Un commit = un cambio lógico. No mezclar cosas sin relación.
- Después de cada commit: `git push origin dev` (o la rama de trabajo). Si no hay remoto configurado, avisar al usuario.

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
- Convención de nombres: componentes React en `PascalCase.tsx` (`PantallaInicio.tsx`); módulos `.ts` en kebab-case (`use-sala.ts`).

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
