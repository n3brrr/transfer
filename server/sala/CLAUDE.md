# servidor: sala

Propósito: crear salas con token, emparejar dos dispositivos y reenviar la señalización. No guarda nada en disco y no ve el contenido de las transferencias.

Invariantes:

- Un token sin usar caduca a los 5 minutos (`EXPIRE_MS`). Una sala caída tiene 2 minutos de gracia (`GRACE_MS`) antes de borrarse.
- El creador tiene 60 segundos para aceptar o rechazar a quien quiere unirse (`PENDING_MS`).
- `sweep()` borra las salas caducadas. `server/index.ts` lo llama de forma periódica (y `sweepFailures()` para el límite de intentos).
- `limite-intentos.ts` cuenta por IP: 20 fallos por minuto, 200 fallos globales por minuto y 10 salas creadas por minuto.

Trampas conocidas:

- No registrar el token completo en logs; `shared/token/token.ts` lo normaliza, pero el servidor nunca lo imprime.
- Un token que no existe responde con el código `not_found`. No añadir códigos que distingan "no existe" de "caducado": revelarían qué tokens hubo.
- La IP viene de `X-Forwarded-For` solo si `TRUST_PROXY=1` (detrás de Caddy). Sin el proxy, cualquiera puede falsear esa cabecera (`server/index.ts`).
