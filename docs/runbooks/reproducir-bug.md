# Runbook: reproducir un bug

Objetivo: tener un caso que falle de forma repetible antes de tocar código.

## Pasos

1. **Anotar el síntoma exacto.** Qué se hizo, qué se esperaba y qué pasó. Si hay texto de error, copiarlo tal cual.
2. **Identificar la feature** con `docs/feature-map.md`. Un error de emparejamiento va a `sala`; uno de envío o descarga, a `transferencia`.
3. **Levantar el entorno de desarrollo:**
   - `pnpm dev:server` (puerto 8080)
   - `pnpm dev:client` (Vite, abre la URL que indique)
     Dos dispositivos: en el segundo, usar la IP de la red local o el QR de la sala.
4. **Reproducir con el caso mínimo.** Un archivo pequeño antes que uno grande; un solo texto antes que varios. Si solo falla con un tamaño o formato concreto, anotarlo.
5. **Mirar la consola del navegador y la del servidor.** El servidor no registra contenido, así que los errores de señalización aparecen sobre todo en la consola del navegador.
6. **Confirmar que se reproduce dos veces seguidas.** Si no, es un problema de carrera o de red: anotar las condiciones (Wi‑Fi, móvil, recarga de la página).

## Antes de tocar código

- Escribir el test que lo cubra si el bug es importante (ver `CLAUDE.md`, sección de tests). Hoy los tests están aplazados: en ese caso, dejar el paso de reproducción anotado en el commit o en `docs/plan.md`.
- Si no se reproduce después de dos intentos, parar y explicar qué se ha probado. No seguir cambiando código a ciegas.

## Trampas

- Cerrar una pestaña borra el estado de la sala: reproducir siempre desde el principio.
- Los dos dispositivos deben tener la misma versión del código. Tras un cambio en `shared/protocolo/`, recargar ambos.
