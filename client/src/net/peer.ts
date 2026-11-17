import type { FromServer } from '../../../shared/protocol';
import type { Signaling } from './signaling';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Fase 2: aquí se añade el servidor TURN (coturn) para conectar desde otras redes, p. ej.
  // { urls: 'turn:tu-dominio.duckdns.org:3478', username: 'usuario', credential: 'clave' },
];

// Tiempo que se espera a que una conexión en "disconnected" se recupere sola
const DISCONNECTED_MS = 5000;

// Mensajes que llegan por el canal antes de que la pantalla de la sala se monte y escuche: se guardan y se reproducen en replayEarly
const MAX_TEMPRANOS = 500;
const tempranos = new WeakMap<RTCDataChannel, MessageEvent[]>();

// Entrega a `handler`, en orden, lo recibido desde que se abrió el canal. Llamar justo después de añadir el oyente de mensajes.
export function replayEarly(ch: RTCDataChannel, handler: (e: MessageEvent) => void): void {
  const guardados = tempranos.get(ch);
  tempranos.delete(ch); // desde ahora los mensajes solo llegan por el oyente normal
  guardados?.forEach(handler);
}

type SignalData = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };

type Opciones = {
  signal?: AbortSignal; // para cancelar el intento
  pendientes?: FromServer[]; // mensajes que llegaron antes de empezar
};

// Abre el canal de datos con el otro dispositivo. Quien se une ofrece (initiator), quien espera responde.
export function connectPeer(sig: Signaling, initiator: boolean, { signal, pendientes = [] }: Opciones = {}): Promise<RTCDataChannel> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Conexión cancelada'));

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const early: RTCIceCandidateInit[] = []; // candidatos que llegan antes de la descripción remota
    let remoteSet = false;
    let settled = false; // ya se resolvió o se rechazó la promesa
    let limpio = false;
    let canal: RTCDataChannel | null = null;
    let tDisconnected: number | undefined;
    let cadena: Promise<void> = Promise.resolve(); // los mensajes se procesan de uno en uno

    const alAbortar = () => fallar(new Error('Conexión cancelada'));
    const encolar = (m: FromServer) => {
      cadena = cadena.then(() => procesar(m)).catch((e) => fallar(e instanceof Error ? e : new Error(String(e))));
    };
    const stop = sig.on(encolar);

    // Quita todos los oyentes y cierra la conexión
    function limpiar() {
      if (limpio) return;
      limpio = true;
      stop();
      clearTimeout(tDisconnected);
      signal?.removeEventListener('abort', alAbortar);
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.ondatachannel = null;
      pc.close();
    }

    // Antes de abrirse rechaza la promesa; después cierra el canal para que quien lo usa se entere
    function fallar(err: Error) {
      if (!settled) {
        settled = true;
        limpiar();
        reject(err);
      } else {
        canal?.close();
      }
    }

    function abierto(ch: RTCDataChannel) {
      if (settled) return;
      settled = true;
      stop();
      signal?.removeEventListener('abort', alAbortar);
      pc.onicecandidate = null;
      pc.ondatachannel = null;
      resolve(ch);
    }

    function bind(ch: RTCDataChannel) {
      canal = ch;
      ch.binaryType = 'arraybuffer';
      tempranos.set(ch, []);
      ch.addEventListener('message', (e) => {
        const guardados = tempranos.get(ch);
        if (guardados && guardados.length < MAX_TEMPRANOS) guardados.push(e);
      });
      ch.addEventListener('close', () => (settled ? limpiar() : fallar(new Error('El canal se cerró'))));
      if (ch.readyState === 'open') abierto(ch);
      else ch.addEventListener('open', () => abierto(ch), { once: true });
    }

    // Un candidato de un intento anterior puede no encajar: se ignora
    const agregar = (c: RTCIceCandidateInit) => pc.addIceCandidate(c).catch(() => {});

    async function procesar(m: FromServer) {
      if (m.t !== 'signal' || limpio) return;
      const data = m.data as SignalData | null;
      if (!data || typeof data !== 'object') return;
      if (data.sdp) {
        // Quien ofrece solo acepta respuestas y quien responde solo ofertas
        if ((data.sdp.type === 'offer') === initiator) return;
        await pc.setRemoteDescription(data.sdp);
        remoteSet = true;
        for (const c of early.splice(0)) await agregar(c);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          sig.send({ t: 'signal', data: { sdp: pc.localDescription } });
        }
      } else if (data.candidate) {
        if (remoteSet) await agregar(data.candidate);
        else early.push(data.candidate);
      }
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) sig.send({ t: 'signal', data: { candidate: e.candidate.toJSON() } });
    };
    pc.onconnectionstatechange = () => {
      clearTimeout(tDisconnected);
      if (pc.connectionState === 'failed') {
        fallar(new Error('No se pudo conectar con el otro dispositivo'));
      } else if (pc.connectionState === 'disconnected') {
        tDisconnected = window.setTimeout(() => fallar(new Error('Se perdió la conexión con el otro dispositivo')), DISCONNECTED_MS);
      }
    };
    signal?.addEventListener('abort', alAbortar);

    if (initiator) {
      bind(pc.createDataChannel('datos'));
      pc.createOffer()
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          sig.send({ t: 'signal', data: { sdp: pc.localDescription } });
        })
        .catch((e) => fallar(e instanceof Error ? e : new Error(String(e))));
    } else {
      pc.ondatachannel = (e) => bind(e.channel);
    }

    pendientes.forEach(encolar);
  });
}
