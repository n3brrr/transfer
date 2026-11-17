import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import type { FromServer, ToServer } from '../shared/protocol';
import { isValidToken, normalizeToken } from '../shared/token';
import { Rooms } from './rooms';
import { allowAttempt, registerFailure, sweepFailures } from './limiter';

const PORT = Number(process.env.PORT ?? 8080);
// DIST_DIR permite servir otra carpeta de la web (para probar sin tocar client/dist)
const DIST = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : fileURLToPath(new URL('../client/dist', import.meta.url));
// Orígenes admitidos en el WebSocket, separados por comas (p. ej. https://mitransfer.duckdns.org).
// Si se define, solo valen esos; si no, vale el mismo host de la página (desarrollo)
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim().replace(/\/$/, '').toLowerCase())
  .filter(Boolean);

// Topes contra abuso
const MAX_ROOMS = 200;
const MAX_CONNECTIONS = 200;
const MAX_CONNECTIONS_PER_IP = 20;
const MAX_MESSAGES_PER_SECOND = 50;
const MAX_BUFFERED_BYTES = 1024 * 1024; // un destinatario que no lee se desconecta en vez de acumular memoria
const IDLE_MS = 30_000; // tiempo máximo de una conexión que no llega a crear ni unirse a una sala
// Solo detrás de Caddy (TRUST_PROXY=1) se confía en X-Forwarded-For; en directo lo podría falsear cualquiera
const TRUST_PROXY = process.env.TRUST_PROXY === '1';
const MAX_INVALID_MESSAGES = 5;
const HEARTBEAT_MS = 30_000;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const PERMISSIONS = [
  'camera', 'microphone', 'geolocation', 'payment', 'usb', 'serial', 'bluetooth', 'hid', 'midi',
  'display-capture', 'accelerometer', 'gyroscope', 'magnetometer', 'browsing-topics', 'publickey-credentials-get',
]
  .map((f) => `${f}=()`)
  .join(', ');

// El WebSocket va al mismo host: se nombra explícito porque 'self' no cubre ws/wss en todos los navegadores
function securityHeaders(req: IncomingMessage): Record<string, string> {
  const host = req.headers.host;
  const ws = host && /^[a-z0-9.-]+(:\d{1,5})?$/i.test(host) ? ` ws://${host} wss://${host}` : '';
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    `connect-src 'self'${ws}`,
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': PERMISSIONS,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}

function reply(req: IncomingMessage, res: ServerResponse, status: number, body: string | Buffer, headers: Record<string, string> = {}): void {
  const data = typeof body === 'string' ? Buffer.from(body) : body;
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders(req), ...headers, 'Content-Length': data.length });
  res.end(req.method === 'HEAD' ? undefined : data);
}

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(req, res, 405, 'Método no permitido', { Allow: 'GET, HEAD' });

  let path: string;
  try {
    path = decodeURIComponent((req.url ?? '/').split(/[?#]/)[0]);
  } catch {
    return reply(req, res, 400, 'Petición no válida');
  }
  if (path === '/health') return reply(req, res, 200, 'ok');

  // Se aceptan / y \ como separadores (Windows) y se rechazan los trozos que puedan salirse de la carpeta
  const parts = path.split(/[\\/]+/).filter(Boolean);
  if (path.includes('\0') || parts.some((p) => p.startsWith('.') || p.includes(':'))) return reply(req, res, 400, 'Petición no válida');

  // Sin extensión es una ruta de la app (una sola página); con extensión, un archivo que debe existir
  const isPage = extname(parts.at(-1) ?? '') === '';
  const file = join(DIST, ...(isPage ? ['index.html'] : parts));
  if (!file.startsWith(DIST + sep)) return reply(req, res, 400, 'Petición no válida');

  let data: Buffer;
  try {
    data = await readFile(file);
  } catch {
    return reply(req, res, 404, isPage ? 'Falta compilar el cliente: pnpm build' : 'No encontrado');
  }
  const cache = !isPage && parts[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'no-cache';
  reply(req, res, 200, data, {
    'Content-Type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': cache,
  });
}

const server = createServer((req, res) => {
  serve(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
});

const rooms = new Rooms();
const sockets = new Map<string, WebSocket>(); // deviceId → conexión actual
const connectionsByIp = new Map<string, number>();
const alive = new WeakSet<WebSocket>();
let closing = false;

function send(ws: WebSocket | undefined, msg: FromServer): void {
  if (!ws || ws.readyState !== ws.OPEN) return;
  if (ws.bufferedAmount > MAX_BUFFERED_BYTES) return ws.terminate();
  ws.send(JSON.stringify(msg));
}

const ID = /^[\w-]{8,64}$/;

// Devuelve el mensaje solo si tiene la forma exacta que espera el protocolo
function parse(raw: RawData, isBinary: boolean): ToServer | null {
  if (isBinary) return null;
  try {
    const m = JSON.parse(raw.toString());
    if (!m || typeof m !== 'object') return null;
    if (m.t === 'create' && typeof m.deviceId === 'string' && ID.test(m.deviceId)) return m;
    if (m.t === 'join' && typeof m.deviceId === 'string' && ID.test(m.deviceId) && typeof m.token === 'string' && m.token.length <= 32) return m;
    if (m.t === 'signal' || m.t === 'leave') return m;
  } catch {
    // JSON no válido
  }
  return null;
}

// Solo actúa si esta conexión sigue siendo la vigente del dispositivo
function leave(deviceId: string, ws: WebSocket): void {
  if (sockets.get(deviceId) !== ws) return;
  const peer = rooms.peerOf(deviceId);
  rooms.leave(deviceId);
  sockets.delete(deviceId);
  if (peer) send(sockets.get(peer), { t: 'peer-left' });
}

function ipOf(req: IncomingMessage): string {
  // Detrás de Caddy la IP real viene en x-forwarded-for; se toma la última, que es la que añadió el proxy
  const forwarded = req.headers['x-forwarded-for'];
  const ip = TRUST_PROXY && typeof forwarded === 'string' ? forwarded.split(',').at(-1)?.trim() : req.socket.remoteAddress;
  return (ip || 'desconocida').slice(0, 64);
}

// Los navegadores siempre envían Origin en el WebSocket; sin él no es la web, así que se rechaza
function originAllowed(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (ALLOWED_ORIGINS.length) return ALLOWED_ORIGINS.includes(origin.toLowerCase());
  try {
    return new URL(origin).host === req.headers.host?.toLowerCase();
  } catch {
    return false;
  }
}

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const reject = (status: string) => {
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  };
  socket.on('error', () => socket.destroy());
  if ((req.url ?? '').split('?')[0] !== '/ws') return reject('404 Not Found');
  if (!originAllowed(req)) return reject('403 Forbidden');
  const ip = ipOf(req);
  if (wss.clients.size >= MAX_CONNECTIONS || (connectionsByIp.get(ip) ?? 0) >= MAX_CONNECTIONS_PER_IP) return reject('429 Too Many Requests');
  wss.handleUpgrade(req, socket, head, (ws) => connect(ws, ip));
});

function connect(ws: WebSocket, ip: string): void {
  connectionsByIp.set(ip, (connectionsByIp.get(ip) ?? 0) + 1);
  alive.add(ws);
  let deviceId: string | null = null;
  let windowStart = 0;
  let inWindow = 0;
  let invalid = 0;

  // Antes de usar otro deviceId en esta conexión, se suelta el anterior
  const takeDevice = (id: string) => {
    if (deviceId && deviceId !== id) leave(deviceId, ws);
    deviceId = id;
  };

  // Una conexión que no crea ni se une a una sala en poco tiempo no sirve para nada: se libera su hueco
  const idle = setTimeout(() => {
    if (!deviceId) ws.close(1008, 'sin actividad');
  }, IDLE_MS);

  ws.on('pong', () => alive.add(ws));
  ws.on('error', () => ws.terminate());

  ws.on('message', (raw, isBinary) => {
    const now = Date.now();
    if (now - windowStart >= 1000) {
      windowStart = now;
      inWindow = 0;
    }
    const m = ++inWindow > MAX_MESSAGES_PER_SECOND ? null : parse(raw, isBinary);
    if (!m) {
      if (++invalid >= MAX_INVALID_MESSAGES) ws.close(1008, 'mensajes no válidos');
      return;
    }

    if (m.t === 'create') {
      rooms.sweep();
      if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', code: 'rate_limited' });
      takeDevice(m.deviceId);
      const oldPeer = rooms.peerOf(m.deviceId);
      const token = rooms.create(m.deviceId);
      sockets.set(m.deviceId, ws);
      send(ws, { t: 'created', token });
      if (oldPeer) send(sockets.get(oldPeer), { t: 'peer-left' });
    } else if (m.t === 'join') {
      if (!allowAttempt(ip)) return send(ws, { t: 'error', code: 'rate_limited' });
      // Un código con otro formato no puede existir: ni se busca, y cuenta como intento fallido
      if (!isValidToken(normalizeToken(m.token))) {
        registerFailure(ip);
        return send(ws, { t: 'error', code: 'not_found' });
      }
      const oldPeer = rooms.peerOf(m.deviceId);
      const result = rooms.join(m.token, m.deviceId);
      if (result !== 'ok') {
        registerFailure(ip);
        return send(ws, { t: 'error', code: result });
      }
      takeDevice(m.deviceId);
      sockets.set(m.deviceId, ws);
      send(ws, { t: 'joined' });
      const peer = rooms.peerOf(m.deviceId);
      if (peer) send(sockets.get(peer), { t: 'peer-joined' });
      // Si venía de otra sala, su compañero ya no tiene con quién hablar
      if (oldPeer && oldPeer !== peer) send(sockets.get(oldPeer), { t: 'peer-left' });
    } else if (m.t === 'signal' && deviceId && sockets.get(deviceId) === ws) {
      const peer = rooms.peerOf(deviceId);
      if (peer) send(sockets.get(peer), { t: 'signal', data: m.data });
    } else if (m.t === 'leave' && deviceId) {
      leave(deviceId, ws);
      deviceId = null;
    }
  });

  ws.on('close', () => {
    clearTimeout(idle);
    const left = (connectionsByIp.get(ip) ?? 1) - 1;
    if (left > 0) connectionsByIp.set(ip, left);
    else connectionsByIp.delete(ip);
    if (deviceId) leave(deviceId, ws);
    if (closing && wss.clients.size === 0) process.exit(0);
  });
}

// Elimina las conexiones que ya no responden
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, HEARTBEAT_MS).unref();

setInterval(() => {
  rooms.sweep();
  sweepFailures();
}, 15_000).unref();

// Ningún error de una petición debe tumbar el servidor; solo se anota un mensaje genérico
function logError(err: unknown): void {
  const code = err instanceof Error ? ((err as NodeJS.ErrnoException).code ?? err.name) : 'desconocido';
  console.error(`Error inesperado (${code})`);
}
process.on('uncaughtException', logError);
process.on('unhandledRejection', logError);

// Cierre ordenado (docker stop envía SIGTERM): sale en cuanto se cierran todos los WebSocket
function shutdown(): void {
  if (closing) return;
  closing = true;
  for (const ws of wss.clients) ws.close(1001, 'servidor detenido');
  server.close();
  server.closeIdleConnections();
  if (wss.clients.size === 0) process.exit(0);
  // Los que no contesten al cierre se cortan a la fuerza
  setTimeout(() => {
    for (const ws of wss.clients) ws.terminate();
    server.closeAllConnections();
    process.exit(0);
  }, 1000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () => console.log(`Transferir en http://localhost:${PORT}`));
