// Cliente ↔ servidor
export type ToServer =
  | { t: 'create'; deviceId: string }
  // direct: quien se reúne con una sala ya emparejada dice si su canal directo sigue abierto (así no se reempareja)
  | { t: 'join'; token: string; deviceId: string; direct?: boolean }
  // El creador responde a la solicitud de un dispositivo que quiere unirse
  | { t: 'accept' }
  | { t: 'reject' }
  | { t: 'signal'; data: unknown }
  | { t: 'leave' }

export type ServerError =
  'not_found' | 'full' | 'expired' | 'rate_limited' | 'rejected' | 'no_answer'

export type FromServer =
  | { t: 'created'; token: string }
  // Al solicitante: el creador debe aceptarlo antes de emparejarse (`joined` llega solo si acepta)
  | { t: 'pending' }
  // Al creador: un dispositivo quiere unirse; `join-cancelled` si se arrepiente o no se contesta a tiempo
  | { t: 'join-request' }
  | { t: 'join-cancelled' }
  | { t: 'joined' }
  // direct: el otro dispositivo se reunió con su canal directo aún abierto
  | { t: 'peer-joined'; direct?: boolean }
  | { t: 'peer-left' }
  | { t: 'signal'; data: unknown }
  | { t: 'error'; code: ServerError }

// Dispositivo ↔ dispositivo (canal WebRTC, JSON; los bloques de archivo van en binario)
export type PeerMsg =
  // thumb: miniatura JPEG diminuta como data URL (solo imágenes); el receptor la valida antes de mostrarla
  | {
      t: 'file-add'
      id: string
      name: string
      size: number
      mime: string
      thumb?: string
    }
  | { t: 'file-remove'; id: string }
  // `offset`: al reanudar, el receptor ya tiene escritos esos bytes y el emisor sigue desde ahí
  | { t: 'file-request'; id: string; offset?: number }
  | { t: 'file-start'; id: string }
  | { t: 'file-end'; id: string }
  | { t: 'file-cancel'; id: string }
  // El receptor confirma los bytes ya ESCRITOS (no solo recibidos): frena al emisor y le da el progreso
  | { t: 'file-ack'; id: string; received: number }
  // Los textos grandes se envían en partes (un mensaje WebRTC admite ~256 KB)
  | {
      t: 'text-add'
      id: string
      format: string
      content: string
      part: number
      parts: number
    }
  | { t: 'text-remove'; id: string }
  // Nombre con el que el otro dispositivo quiere que se le vea (se envía al abrir el canal y al cambiarlo)
  | { t: 'hello'; name: string }
  | { t: 'bye' }
  // Latido: cualquier mensaje recibido cuenta como señal de vida; el ping solo la provoca cuando no hay tráfico
  | { t: 'ping' }
  | { t: 'pong' }
