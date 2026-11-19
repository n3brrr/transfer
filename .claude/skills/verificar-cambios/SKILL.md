---
name: verificar-cambios
description: Usar antes de dar por terminado un cambio en Transferir o antes de hacer commit. Ejecuta pnpm verify y, si el cambio toca la interfaz o la conexión, la comprobación manual con dos ventanas.
---

# Verificar cambios en Transferir

1. Ejecutar `pnpm verify` desde la raíz. Si falla, leer el primer error y corregirlo; no seguir con otros cambios hasta que pase.
2. Si el fallo es de formato (`lint`), ejecutar `pnpm format` y volver a `pnpm verify`.
3. Si el cambio toca `client/src/sala/`, `client/src/transferencia/`, `server/` o `shared/protocolo/`, comprobar a mano: `pnpm dev:server` y `pnpm dev:client`, dos ventanas, crear sala, unirse, enviar un archivo y un texto.
4. Si el cambio toca la interfaz, comprobar la vista a 360 px en DevTools.
5. Confirmar que `tmp/` está vacía o no existe.
6. Informar del resultado de cada comando, tal cual. Si algo no se pudo comprobar, decirlo.

No dar por bueno un cambio solo porque `pnpm test` pase: hoy los tests están aplazados y `pnpm test` pasa con cero tests.

Ver también `docs/runbooks/verificar-cambios.md`.
