import type { PeerMsg } from '../../../shared/protocol';
import { sanitizeDeviceName, sanitizeFormat, sanitizeMime, sanitizeName } from '../files/validar';

// Todo lo que llega por el canal WebRTC es entrada no fiable: aquí se valida la forma exacta de cada mensaje.
export const TEXT_PART = 15_000; // caracteres por mensaje: escapado en JSON puede crecer ×6 y el mensaje debe quedar bajo MAX_MSG_CHARS y ~256 KB
const MAX_PARTS = 80; // un texto de 1 MB son 70 partes
const MAX_FILE_SIZE = 2 ** 40; // 1 TiB
const MAX_MSG_CHARS = 100_000; // un mensaje JSON legítimo no llega a 91.000 (15.000 caracteres × 6 de escapado + cabecera)

// Los ids los genera randomId(): 32 hex. Así tampoco pueden ser "__proto__" ni nada raro como clave de objeto.
const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v);
const isCount = (v: unknown, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= max;

// Devuelve el mensaje solo si tiene la forma exacta del protocolo; nombre, tipo y formato ya salen limpios
export function parseMsg(data: string): PeerMsg | null {
  if (data.length > MAX_MSG_CHARS) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(data);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  switch (m.t) {
    case 'ping':
    case 'pong':
    case 'bye':
      return { t: m.t };
    case 'hello':
      return typeof m.name === 'string' ? { t: 'hello', name: sanitizeDeviceName(m.name) } : null;
    case 'file-remove':
    case 'file-start':
    case 'file-end':
    case 'file-cancel':
    case 'text-remove':
      return isId(m.id) ? { t: m.t, id: m.id } : null;
    case 'file-add':
      if (!isId(m.id) || typeof m.name !== 'string' || !isCount(m.size, MAX_FILE_SIZE)) return null;
      return { t: 'file-add', id: m.id, name: sanitizeName(m.name), size: m.size, mime: sanitizeMime(m.mime) };
    case 'file-request':
      if (!isId(m.id)) return null;
      if (m.offset === undefined) return { t: 'file-request', id: m.id };
      return isCount(m.offset, MAX_FILE_SIZE) ? { t: 'file-request', id: m.id, offset: m.offset } : null;
    case 'file-ack':
      return isId(m.id) && isCount(m.received, MAX_FILE_SIZE) ? { t: 'file-ack', id: m.id, received: m.received } : null;
    case 'text-add':
      if (!isId(m.id) || typeof m.content !== 'string' || m.content.length > TEXT_PART) return null;
      if (!isCount(m.parts, MAX_PARTS) || m.parts < 1 || !isCount(m.part, MAX_PARTS) || m.part >= m.parts) return null;
      return { t: 'text-add', id: m.id, format: sanitizeFormat(m.format), content: m.content, part: m.part, parts: m.parts };
    default:
      return null;
  }
}
