# Mapa de features

Lectura rápida: qué hace cada feature, dónde está y de qué depende. Las tablas y reglas de dependencia se comprueban con `pnpm lint` (chequeo de arquitectura).

| feature               | qué hace                                                                                                         | carpeta                              | tests                | dependencias                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------- | ------------------------------------------- |
| sala (emparejar)      | Crear y unirse a una sala con token, QR, señalización y conexión WebRTC. Guarda el estado compartido de la sala. | `client/src/sala/`, `server/sala/`   | aplazados (`tests/`) | `shared/*`, `transferencia`, `portapapeles` |
| archivos              | Pantalla de la lista compartida de archivos: enviar, descargar, velocidad y tiempo restante.                     | `client/src/archivos/`               | aplazados            | `sala`, `transferencia`                     |
| texto                 | Pantalla de textos compartidos, con resaltado de sintaxis (carga aparte).                                        | `client/src/texto/`                  | aplazados            | `sala`, `transferencia`, `portapapeles`     |
| app (cáscara)         | Arranque, navegación entre pantallas, cabecera con pestañas y aviso en el título.                                | `client/src/app/`                    | aplazados            | `sala`, `archivos`, `texto`, `portapapeles` |
| transferencia (motor) | Trocear y recomponer, control de flujo, escritura a disco, validación de entrada, formatos y miniaturas.         | `client/src/transferencia/`          | aplazados            | `shared/*`                                  |
| portapapeles          | Copiar texto al portapapeles con respaldo.                                                                       | `client/src/portapapeles/`           | aplazados            | ninguna                                     |
| servidor (sala)       | Salas con token y caducidad; límite de intentos por IP.                                                          | `server/sala/`                       | aplazados            | `shared/*`                                  |
| servidor (entrada)    | HTTP estático, `/health`, WebSocket `/ws`, CSP.                                                                  | `server/index.ts`                    | aplazados            | `server/sala`, `shared/*`                   |
| protocolo y token     | Contrato de mensajes y generación/normalización de tokens. Lo usan cliente y servidor.                           | `shared/protocolo/`, `shared/token/` | aplazados            | ninguna                                     |

## Reglas de dependencia

- `app` puede usar cualquier feature.
- `archivos` y `texto` usan `sala`, `transferencia` y `portapapeles`. No usan otra feature.
- `sala` usa `transferencia`, `portapapeles` y `shared`. No usa `archivos` ni `texto`.
- `transferencia` no usa features; solo `shared`.
- Ninguna feature importa de `app`.
- El servidor no importa nada de `client/`. El cliente no importa nada de `server/`.

## Dónde mirar primero

- Cambiar cómo se empareja: `client/src/sala/` y `server/sala/salas.ts`.
- Cambiar el formato de los mensajes: `shared/protocolo/protocol.ts`.
- Cambiar cómo se envían o reciben archivos: `client/src/transferencia/transferencia.ts`.
- Cambiar validación de lo que llega del otro lado: `client/src/transferencia/validar-entrada.ts`.
