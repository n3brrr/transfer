# Runbook: depurar

## Emparejamiento no conecta

1. ¿El servidor responde? `curl http://127.0.0.1:8080/health` debe dar 200.
2. ¿El token es válido y no ha caducado? Un token sin usar caduca a los 5 minutos. Crear una sala nueva.
3. ¿Se ha superado el límite de intentos? 20 fallos por minuto por IP. Esperar un minuto.
4. Revisar la señalización en la consola del navegador: `signal` debe ir en los dos sentidos. Si solo va en uno, es la negociación WebRTC (`client/src/sala/conexion-webrtc.ts`).
5. Redes que bloquean WebRTC (algunas redes corporativas o de móvil con NAT estricto). Probar en otra red.

## La transferencia se corta o se queda parada

1. Mirar si el mensaje de error es «Llegan datos más rápido de lo permitido»: el receptor no confirma a tiempo y se supera `MAX_PENDING` (32 MB). Mirar `client/src/transferencia/trocear-y-recomponer.ts`.
2. Si se queda parada sin error, mirar la ventana de 8 MB (`WINDOW` en `client/src/transferencia/transferencia.ts`) y los `file-ack` que llegan.
3. Móvil: el navegador puede suspender la pestaña en segundo plano. Mantenerla en primer plano para probar.

## Un archivo llega con otro nombre o sin extensión

Es el saneado de nombres de `client/src/transferencia/validar-entrada.ts`: se quitan rutas, caracteres invisibles y nombres reservados de Windows. Comparar el nombre original con el resultado de `sanitizeName`.

## El servidor no arranca

- Puerto ocupado: cambiar `PORT` o parar el proceso anterior.
- Error de tipos en el arranque con `tsx`: ejecutar `pnpm typecheck` para ver la línea exacta.
- En Docker: `docker compose logs` (el servidor no registra contenido, pero sí errores de arranque).

## Herramientas útiles

- `pnpm dev:server` con `tsx watch` recarga al guardar.
- Consola del navegador: errores de CSP aparecen ahí, con la cabecera que los bloquea.
- DevTools → Application: `localStorage` del nombre de dispositivo (clave `transferir.nombre`).
