# Transferir — Cómo arrancarlo en casa

Todo se hace **en el PC de casa**. En los otros dispositivos (móvil, otro PC) no se instala nada: solo se abre una dirección en el navegador.

---

## MODO RÁPIDO · Solo en tu red, bajo demanda (sin dominio ni HTTPS)

Es lo más simple si solo la usas dentro de casa: un solo contenedor que arrancas cuando lo necesitas y que desaparece al pararlo. No guarda nada. No hace falta DuckDNS, `.env` ni la PARTE 1.

1. Abre **Docker Desktop** y espera a que ponga **Engine running**.
2. En PowerShell, dentro de la carpeta del proyecto:
   ```
   docker compose -f docker-compose.local.yml up --build
   ```
   La primera vez tarda unos minutos. Cuando salga `Transferir en http://localhost:8080`, ya está lista.
3. Averigua la IP de tu PC (`ipconfig` → **Dirección IPv4**, por ejemplo `192.168.1.35`).
4. **Solo la primera vez**, abre el puerto en el firewall (PowerShell como administrador). Tu red de casa tiene que estar como **Privada**:
   ```
   New-NetFirewallRule -DisplayName "Transferir (local)" -Direction Inbound -Protocol TCP -LocalPort 8080 -Profile Private -Action Allow
   ```
5. Abre `http://192.168.1.35:8080` (con tu IP) en el PC y en el móvil, **conectados a la misma Wi-Fi**.
6. Para parar: `Ctrl+C` en esa ventana. Se borra el contenedor y todo lo de la sesión.

Qué cambia sin HTTPS: en el móvil no están el botón **Pegar** ni el aviso de pantalla encendida; copiar, enviar archivos y textos funcionan igual. Los archivos y textos van cifrados de un dispositivo a otro por WebRTC aunque la página use HTTP.

Para publicar el puerto solo en la IP de tu PC, define antes `$env:BIND_IP="192.168.1.35"`. No lo abras en el router ni uses DMZ o UPnP: es solo para tu red. Para HTTPS o el dominio de DuckDNS, sigue con la PARTE 1.

---

## PARTE 1 · Primera vez (se hace una sola vez)

### 1. Pasar el proyecto al PC de casa
- Copia la carpeta `transferir` completa por USB, nube o zip.
- Puedes **dejar fuera**: `node_modules`, `client/dist` y `tmp`.
- Ponla donde quieras, por ejemplo `C:\Users\TU_USUARIO\Documents\proyectos\transferir`.

### 2. Instalar Docker Desktop
- Descárgalo de docker.com, instálalo y reinicia si te lo pide.
- Ábrelo: `Settings` → `General` → **desactiva** «Start Docker Desktop when you sign in to Windows». Así no arranca con Windows y lo abres tú cuando lo necesites.
- Espera a que abajo a la izquierda ponga **Engine running**.

### 3. Crear tu dirección en DuckDNS
1. Entra en **duckdns.org** e inicia sesión (Google, GitHub, etc.).
2. En `domains` escribe un nombre (por ejemplo `mitransfer`) y pulsa **add domain**. Tu dirección será `mitransfer.duckdns.org`.
3. Copia el **token** que sale arriba de la página.

### 4. Averiguar la IP de tu PC en casa
En PowerShell:
```
ipconfig
```
Busca **Dirección IPv4** del adaptador que uses (Wi-Fi o Ethernet). Será algo como `192.168.1.35`.

### 5. Apuntar tu dirección a esa IP
Pega esto en el navegador cambiando las tres partes en mayúsculas:
```
https://www.duckdns.org/update?domains=MITRANSFER&token=TU_TOKEN&ip=192.168.1.35
```
Tiene que responder **OK**. (Es importante poner `ip=`; sin él DuckDNS guardaría tu IP pública y no funcionaría.)

### 6. Que la IP del PC no cambie
En el router, busca **reserva DHCP** (o "IP estática") y asigna esa IP a tu PC.
Si no lo haces, cuando la IP cambie tendrás que repetir el paso 5.

### 7. Crear el archivo `.env`
En la carpeta del proyecto, copia `.env.example` y llámalo `.env`. Ábrelo y rellénalo, **sin comillas ni espacios**:
```
DOMAIN=mitransfer.duckdns.org
DUCKDNS_TOKEN=tu-token-aqui
BIND_IP=192.168.1.35
```
`BIND_IP` es la IP del paso 5: así Docker publica el 443 solo en esa dirección y no en las demás interfaces del PC (recomendado). Si lo dejas vacío, escucha en todas.
Este archivo es secreto: nunca lo subas a ningún sitio.

### 8. Abrir el puerto en Windows
Abre PowerShell **como administrador** y ejecuta:
```
New-NetFirewallRule -DisplayName "Transferir" -Direction Inbound -Protocol TCP -LocalPort 443 -Profile Private -Action Allow
```
Tu red de casa tiene que estar como **Privada**: `Configuración` → `Red e Internet` → tu Wi-Fi/Ethernet → **Privada**.

> ⚠️ **Esta app es solo para tu red de casa. Nunca la expongas a internet:**
> - **No redirijas puertos** (port forwarding / NAT) del router hacia este PC, ni el 443 ni ningún otro.
> - **No actives DMZ** ni "host expuesto" para este PC, ni UPnP si tu router lo ofrece.
> - **No pongas la red en modo Pública ni abras la regla del firewall para todos los perfiles.**
> - Tu dirección de DuckDNS apunta a una IP **local** (`192.168.x.x`): desde fuera de casa no llega a nada. Si alguna vez la cambias a tu IP pública, deja de ser seguro.
> - Si compartes el Wi-Fi con visitantes, usa la red de invitados del router (aislada) para ellos, no la principal.

### 9. Arrancarlo
En PowerShell, dentro de la carpeta del proyecto:
```
cd C:\ruta\a\transferir
docker compose up -d --build
```
- La primera vez tarda **varios minutos** (construye la app y el servidor HTTPS). Necesita internet normal; en una red de empresa que bloquee `proxy.golang.org` fallará.
- Cuando acabe no muestra errores.

### 10. Comprobar que funciona
```
docker compose ps
```
`app` debe salir como **Up ... (healthy)** (tarda unos segundos en pasar de `starting` a `healthy`) y `caddy` como **Up**. Caddy no arranca hasta que la app está `healthy`, así que justo tras el `up` puede tardar unos segundos más en aparecer.

```
docker compose logs caddy
```
Busca una línea que diga **certificate obtained successfully**. Puede tardar 1 o 2 minutos desde que arrancó.

### 11. Probarlo
1. En el PC abre `https://mitransfer.duckdns.org`. Debe salir la pantalla Transferir con candado, sin avisos.
2. En el móvil, **conectado al mismo Wi-Fi**, abre la misma dirección.
3. En uno pulsa **Crear sala** y en el otro escribe el código y pulsa **Unirme**.
4. Suelta un archivo pequeño y descárgalo en el otro. Luego prueba un texto.
5. Después, un archivo grande (1 GB o más) entre dos PC.

---

## PARTE 2 · Uso diario

**Nada arranca solo**: ni Docker con Windows ni los contenedores. Lo levantas tú cuando lo necesites.

**Para empezar:**
1. Abre **Docker Desktop** y espera a que ponga **Engine running**.
2. En PowerShell, dentro de la carpeta del proyecto:
   ```
   cd C:\ruta\a\transferir
   docker compose up -d
   ```
   (Sin `--build`: es más rápido. Tarda unos segundos: Caddy espera a que la app esté `healthy`.)
3. Abre `https://mitransfer.duckdns.org` en los dos dispositivos.

**Para terminar:**
1. En PowerShell, dentro de la carpeta del proyecto:
   ```
   docker compose down
   ```
   (Sin `-v`. Borra los contenedores pero conserva el certificado.)
2. Si quieres, cierra Docker Desktop (clic derecho en su icono de la barra → **Quit Docker Desktop**).

Mientras esté parado, la dirección no responde. Es lo esperado.

### Comandos útiles
| Qué | Comando |
|---|---|
| Ver si está en marcha (la app debe poner `healthy`) | `docker compose ps` |
| Ver mensajes de la app | `docker compose logs -f app` |
| Ver mensajes del HTTPS | `docker compose logs -f caddy` |
| Parar y limpiar | `docker compose down` |
| Arrancar | `docker compose up -d` |
| Reiniciar | `docker compose restart` |
| Pausar sin borrar contenedores | `docker compose stop` |
| Tras cambiar el código | `docker compose up -d --build` |

⚠️ **No uses `docker compose down -v`**: borraría el certificado y tendría que pedir otro.
El certificado se renueva solo.

---

## PARTE 3 · Si algo falla

| Problema | Qué hacer |
|---|---|
| El móvil o el PC no encuentran `mitransfer.duckdns.org` | Es la protección *DNS rebinding* de tu router. Añade una excepción para `duckdns.org` en el router (o en tu Pi-hole/DNS). Para comprobarlo rápido, pon en el móvil el DNS `8.8.8.8` |
| Deja de funcionar de repente | Mira si cambió la IP del PC (`ipconfig`). Si cambió, repite el paso 5 y haz la reserva del paso 6 |
| No carga desde el móvil pero sí desde el PC | Firewall (paso 8) o red en modo **Pública**. Comprueba también que el móvil esté en el mismo Wi-Fi y no en uno de "invitados" |
| El navegador avisa de certificado no válido | El certificado aún no se ha obtenido: espera 2 minutos y mira `docker compose logs caddy` |
| Se conectan pero no pasan archivos | Algunos Wi-Fi aíslan los dispositivos entre sí ("aislamiento de clientes" o red de invitados). Usa la red principal |
| `docker compose` dice que falta `.env` | Revisa el paso 7: el archivo debe llamarse exactamente `.env` y estar en la carpeta del proyecto |
| `app` se queda en `unhealthy` o Caddy no arranca | Mira `docker compose logs app`; la app comprueba `/health` cada 30 s. Prueba `docker compose up -d --build` |
| Error al construir Caddy (`proxy.golang.org`) | La red bloquea esa descarga. Prueba con otra red o dímelo y buscamos otra vía |
| "Código no válido" | Revisa el código; si pasaron más de 5 minutos, crea otro |
| "Demasiados intentos" | Espera un minuto |

---

## Probarlo sin Docker (solo para desarrollo)

Necesitas Node 24 y pnpm: `npm install -g pnpm@12.5.1`.

```
pnpm install
pnpm build
pnpm start
```
Abre `http://localhost:8080` en dos pestañas. Sin HTTPS, desde otros dispositivos se pierde la escritura directa a disco.

Para ir cambiando código, dos terminales:
```
pnpm dev:server
pnpm dev:client
```
y abre `http://localhost:5173`.
