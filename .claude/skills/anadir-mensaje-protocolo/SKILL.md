---
name: anadir-mensaje-protocolo
description: Usar cuando haya que añadir un mensaje nuevo en Transferir entre cliente y servidor (ToServer, FromServer) o entre dispositivos (PeerMsg). Cubre el tipo, la validación al recibir y el manejo en cada lado.
---

# Añadir un mensaje al protocolo

El contrato vive solo en `shared/protocolo/protocol.ts`. Cualquier mensaje nuevo se añade ahí y se valida al recibir.

1. **Tipo.** Añadir el tipo en `shared/protocolo/protocol.ts`:
   - Cliente → servidor: en `ToServer`.
   - Servidor → cliente: en `FromServer`.
   - Entre dispositivos (JSON por el canal): en `PeerMsg`. Los bloques de archivo van en binario, no como `PeerMsg`.
     Usar el mismo nombre de campo `t` que los mensajes existentes.
2. **Validación al recibir.**
   - Si llega del otro dispositivo: validar tipos, tamaños, ids y longitudes con las funciones de `client/src/transferencia/validar-entrada.ts` (o añadir una nueva allí). Nunca usar el dato sin validar.
   - Si llega al servidor desde un cliente: validar en `server/index.ts` antes de usarlo.
3. **Manejo.**
   - En el cliente, el manejo va en `client/src/sala/use-sala.ts`, no en las pantallas.
   - En el servidor, en `server/index.ts` (o en `server/sala/salas.ts` si es lógica de salas).
4. **Límites.** Si el mensaje puede crecer (listas, textos), poner tope. Los textos grandes se parten (ver `text-add` con `part`/`parts` en `docs/plan.md`).
5. **Documentar.** Añadir una línea en la sección del plan correspondiente, en el mismo commit.
6. **Verificar.** Ejecutar `pnpm verify`. Comprobar a mano con dos ventanas (ver skill `verificar-cambios`).

No cambiar nombres ni formatos de mensajes existentes sin revisar todos sus usos con `Grep` (cliente y servidor).
