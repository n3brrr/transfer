// Cliente ↔ servidor
export type ToServer =
  | { t: 'create'; deviceId: string }
  | { t: 'join'; token: string; deviceId: string }
  | { t: 'signal'; data: unknown }
  | { t: 'leave' };

export type ServerError = 'not_found' | 'full' | 'expired' | 'rate_limited';

export type FromServer =
  | { t: 'created'; token: string }
  | { t: 'joined' }
  | { t: 'peer-joined' }
  | { t: 'peer-left' }
  | { t: 'signal'; data: unknown }
  | { t: 'error'; code: ServerError };

// Dispositivo ↔ dispositivo (canal WebRTC, JSON; los bloques de archivo van en binario)
export type PeerMsg =
  | { t: 'file-add'; id: string; name: string; size: number; mime: string }
  | { t: 'file-remove'; id: string }
  // `offset`: al reanudar, el receptor ya tiene escritos esos bytes y el emisor sigue desde ahí
  | { t: 'file-request'; id: string; offset?: number }
  | { t: 'file-start'; id: string }
  | { t: 'file-end'; id: string }
  | { t: 'file-cancel'; id: string }
  // El receptor confirma los bytes ya ESCRITOS (no solo recibidos): frena al emisor y le da el progreso
  | { t: 'file-ack'; id: string; received: number }
  // Los textos grandes se envían en partes (un mensaje WebRTC admite ~256 KB)
  | { t: 'text-add'; id: string; format: string; content: string; part: number; parts: number }
  | { t: 'text-remove'; id: string }
  | { t: 'bye' }
  // Latido: cualquier mensaje recibido cuenta como señal de vida; el ping solo la provoca cuando no hay tráfico
  | { t: 'ping' }
  | { t: 'pong' };
