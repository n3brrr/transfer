---
name: anadir-feature
description: Usar cuando haya que añadir una feature nueva a Transferir (una pantalla o una funcionalidad con carpeta propia). Indica dónde ubicarla, qué reglas de dependencia respetar y qué documentación actualizar.
---

# Añadir una feature

Antes de empezar, leer `docs/feature-map.md` (dependencias) y `docs/architecture.md` (decisiones).

1. **Decidir la carpeta.** Una feature es una carpeta de primer nivel en `client/src/` (p. ej. `client/src/archivos/`). El código compartido por varias features va a `client/src/transferencia/` (motor) o a `shared/` (contrato), nunca a una carpeta comodín tipo `utils` o `common`.
2. **Respetar las dependencias.**
   - Una feature no importa de otra feature. Lo común va al motor (`transferencia/`) o a `sala/` si es estado compartido.
   - Ninguna feature importa de `app/`.
   - `pnpm lint` comprueba estas reglas (chequeo de arquitectura); si falla, mover el código, no desactivar la regla.
3. **Nombres.** Componentes `PascalCase.tsx` (`PantallaNueva.tsx`). Módulos `.ts` en kebab-case. Sin sufijos `old`, `new`, `v2`, `final`, `temp`.
4. **Conectarla.** Si tiene pantalla, enrutarla desde `client/src/app/App.tsx` (navegación) y, si tiene pestaña, desde `client/src/app/CabeceraPestanas.tsx`.
5. **Documentar.** Añadir una fila a `docs/feature-map.md`. Si tiene lógica no obvia, crear un `CLAUDE.md` local de 10 a 30 líneas en su carpeta (propósito, invariantes, trampas).
6. **Plan.** Si la feature no está en `docs/plan.md`, parar y preguntar antes de implementarla: el plan manda y no se añaden funcionalidades por iniciativa propia.
7. **Verificar.** `pnpm verify` y comprobación manual (ver skill `verificar-cambios`).
