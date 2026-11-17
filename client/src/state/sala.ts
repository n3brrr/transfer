import { useCallback, useEffect, useRef, useState } from 'react';
import type { PeerMsg } from '../../../shared/protocol';
import { randomId } from '../../../shared/token';
import { replayEarly } from '../net/peer';
import { TEXT_PART, parseMsg } from './mensajes';
import {
  AvisoError,
  folderDestination,
  hasFolderPicker,
  hasSavePicker,
  keepAwake,
  pickFolder,
  newSend,
  prepareDestination,
  sendFile,
  stopSend,
  type Destination,
  type Download,
  type Send,
} from '../files/transfer';

export type FileItem = { id: string; name: string; size: number; mime: string; mine: boolean; available: boolean };
export type TextItem = { id: string; format: string; content: string; mine: boolean };
// Un archivo que está subiendo o bajando (clave = id del archivo). `paused`: descarga cortada que continuará si el otro vuelve.
// `rate`: fracción del archivo que avanza por segundo (media suavizada); sirve para la velocidad y el tiempo restante.
export type Transfer = { direction: 'in' | 'out'; fraction: number; state: 'queued' | 'active' | 'paused'; rate?: number };
export type Sala = ReturnType<typeof useSala>;

// Más límites a lo que puede mandar el otro dispositivo (entrada no fiable); los de cada mensaje, en mensajes.ts
const MAX_REMOTE_FILES = 1000;
const MAX_REMOTE_TEXTS = 100;
const MAX_REMOTE_TEXT_CHARS = 20_000_000; // entre todos los textos recibidos
const MAX_INCOMING_TEXTS = 20; // textos a medio recibir a la vez
const RATE_SAMPLE_MS = 500; // cada cuánto se mide la velocidad
const REDRAW_MS = 100; // el progreso se redibuja como mucho cada tanto
const PING_MS = 5000; // latido: un ping cada tanto
const DEAD_MS = 15_000; // sin ninguna señal del otro lado durante tanto tiempo, la conexión se da por muerta
const RESUME_WAIT_MS = 2 * 60_000; // lo descargado a medias se guarda tanto tiempo esperando al otro dispositivo
const AWAKE_NOTICE = 'Mantén la pantalla encendida mientras dura la transferencia';

// Descarga pedida y en espera de turno. Si estuvo cortada, `dl` conserva lo ya escrito (`offset` bytes).
type Queued = { item: FileItem; dest: Destination; dl: Download | null; offset: number };
// Descarga cortada: espera a que el otro dispositivo vuelva a anunciar el archivo
type Paused = Queued & { ready: Promise<void>; timer: number };

// Descarga en curso (solo hay una a la vez; el resto espera en `wanted`)
type Active = {
  id: string;
  item: FileItem;
  dest: Destination;
  dl: Download | null; // null mientras se prepara el destino
  offset: number; // bytes que ya tenía al empezar (reanudación)
  started: boolean; // ya llegó file-start: los bloques binarios son suyos
  ending: boolean; // ya llegó file-end: se está guardando y ya no se puede cancelar
  why: string | null; // motivo si se canceló mientras se preparaba
};

export function useSala(channel: RTCDataChannel) {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [connected, setConnected] = useState(channel.readyState === 'open');
  const [transfers, setTransfers] = useState<Record<string, Transfer>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const channelRef = useRef(channel);
  const filesRef = useRef(files);
  const textsRef = useRef(texts);
  filesRef.current = files;
  textsRef.current = texts;

  const mine = useRef(new Map<string, File>()); // archivos propios: nunca se copian a memoria
  const incomingText = useRef(new Map<string, { parts: number; chunks: (string | undefined)[] }>());

  // Recibir: una descarga activa y las demás esperando turno, con su destino ya elegido
  const wanted = useRef(new Map<string, Queued>());
  const paused = useRef(new Map<string, Paused>());
  const gone = useRef(false); // la sala se desmonta: no hay nada que reanudar
  const current = useRef<Active | null>(null);
  const picking = useRef(false); // hay un diálogo de guardado abierto
  const generation = useRef(0); // sube cuando se pierde el canal: lo que estaba en marcha ya no vale

  // Enviar: lo que ha pedido el otro dispositivo, de uno en uno
  const queue = useRef<string[]>([]);
  const offsets = useRef(new Map<string, number>()); // desde dónde enviar cada archivo pedido
  const sending = useRef<string | null>(null);
  const sends = useRef(new Map<string, Send>()); // envíos que aún esperan su última confirmación

  // Transfers: la fuente de verdad es el ref; el estado de React se actualiza como mucho cada REDRAW_MS
  const tr = useRef<Record<string, Transfer>>({});
  const samples = useRef<Record<string, { at: number; fraction: number }>>({}); // última medida de velocidad de cada transferencia
  const lastDraw = useRef(0);
  const drawTimer = useRef(0);
  const releaseAwake = useRef<(() => void) | null>(null);
  const hiddenBusy = useRef(false); // la pestaña estuvo oculta con una transferencia en marcha

  // Nada de lo que sigue lee estado de React (solo refs y setters), así que una copia antigua sirve igual
  const draw = () => {
    lastDraw.current = performance.now();
    drawTimer.current = 0;
    setTransfers({ ...tr.current });
  };

  // Cambio de estado (empieza, termina, cambia de cola): se pinta ya y se ajusta la pantalla encendida
  const changed = () => {
    clearTimeout(drawTimer.current);
    draw();
    const busy = Object.keys(tr.current).length > 0;
    if (busy && !releaseAwake.current) releaseAwake.current = keepAwake();
    else if (!busy && releaseAwake.current) {
      releaseAwake.current();
      releaseAwake.current = null;
    }
    if (busy && document.visibilityState === 'hidden') hiddenBusy.current = true;
  };
  const setTransfer = (id: string, t: Transfer) => {
    tr.current[id] = t;
    delete samples.current[id]; // cambio de estado: la velocidad se vuelve a medir desde aquí
    changed();
  };
  const dropTransfer = (id: string) => {
    delete samples.current[id];
    if (id in tr.current) {
      delete tr.current[id];
      changed();
    }
  };
  const setFraction = (id: string, fraction: number) => {
    const t = tr.current[id];
    if (!t) return;
    let rate = t.rate;
    const now = performance.now();
    const prev = samples.current[id];
    if (!prev) samples.current[id] = { at: now, fraction };
    else if (now - prev.at >= RATE_SAMPLE_MS) {
      const instant = (fraction - prev.fraction) / ((now - prev.at) / 1000);
      rate = rate === undefined ? instant : rate * 0.7 + instant * 0.3;
      samples.current[id] = { at: now, fraction };
    }
    tr.current[id] = { ...t, fraction, rate };
    if (!drawTimer.current) drawTimer.current = window.setTimeout(draw, Math.max(0, REDRAW_MS - (performance.now() - lastDraw.current)));
  };

  const post = (m: PeerMsg) => {
    const ch = channelRef.current;
    if (ch.readyState === 'open') ch.send(JSON.stringify(m));
  };

  const postText = (id: string, format: string, content: string) => {
    const parts = Math.max(1, Math.ceil(content.length / TEXT_PART));
    for (let part = 0; part < parts; part++) {
      post({ t: 'text-add', id, format, content: content.slice(part * TEXT_PART, (part + 1) * TEXT_PART), part, parts });
    }
  };

  // Avisa de por qué se descartó algo y, si el archivo vacío no se pudo borrar, de que lo borre el usuario
  const settle = (why: string | null, cleaning: Promise<boolean>, name: string) => {
    void cleaning.then((clean) => {
      const text = [why, clean ? null : `Si ha quedado un archivo «${name}» vacío o incompleto en tu carpeta, bórralo a mano.`].filter(Boolean);
      if (text.length) setNotice(text.join(' '));
    });
  };

  // ---------- Recibir ----------

  // Lo que queda por hacer con una descarga que no va a terminar: borrar lo parcial
  const discardQueued = (q: Queued) => (q.dl ? q.dl.abort() : q.dest.discard());

  // Empieza la siguiente descarga en cola, si no hay otra en marcha
  const next = () => {
    if (current.current) return;
    const first = wanted.current.entries().next();
    if (first.done) return;
    const [id, { item, dest, dl, offset }] = first.value;
    wanted.current.delete(id);
    const c: Active = { id, item, dest, dl: null, offset, started: false, ending: false, why: null };
    current.current = c;
    setTransfer(id, { direction: 'in', fraction: item.size ? offset / item.size : 0, state: 'active' });

    const request = (d: Download) => {
      c.dl = d;
      post(offset > 0 ? { t: 'file-request', id, offset } : { t: 'file-request', id });
    };
    if (dl) return request(dl); // reanudación: el destino ya está abierto

    // Los avisos buscan la descarga por id: la misma sigue valiendo tras una pausa
    const onWritten = (written: number) => {
      const a = current.current;
      if (a?.id !== id) return;
      post({ t: 'file-ack', id, received: written });
      setFraction(id, item.size ? written / item.size : 1);
    };
    const onError = () => {
      const a = current.current;
      const why = `No se pudo guardar «${item.name}»`;
      if (a?.id === id) endActive(a, why, true);
      else dropPaused(id, why);
    };

    dest.start(onWritten, onError).then(
      (d) => {
        if (current.current !== c) return settle(c.why, d.abort(), item.name); // se canceló mientras tanto
        request(d);
      },
      () => {
        if (current.current !== c) return settle(c.why, dest.discard(), item.name);
        current.current = null;
        dropTransfer(id);
        settle('No se pudo abrir el destino del archivo', dest.discard(), item.name);
        next();
      },
    );
  };

  // Termina mal la descarga activa: se descarta lo parcial y empieza la siguiente
  const endActive = (c: Active, why: string | null, tell: boolean) => {
    if (current.current !== c || c.ending) return;
    current.current = null;
    dropTransfer(c.id);
    if (tell) post({ t: 'file-cancel', id: c.id });
    if (c.dl) settle(why, c.dl.abort(), c.item.name);
    else c.why = why;
    next();
  };

  // Descarta una descarga pausada (el otro no vuelve, error de escritura o la cancela el usuario)
  const dropPaused = (id: string, why: string | null) => {
    const p = paused.current.get(id);
    if (!p) return;
    paused.current.delete(id);
    clearTimeout(p.timer);
    dropTransfer(id);
    settle(why, discardQueued(p), p.item.name);
  };

  // Deja una descarga en pausa conservando lo ya escrito. `flush` da los bytes escritos tras vaciar lo pendiente.
  const pauseDownload = (id: string, q: Queued, flush: Promise<number>) => {
    const p: Paused = {
      ...q,
      ready: Promise.resolve(),
      timer: window.setTimeout(() => dropPaused(id, `El otro dispositivo no volvió: se descartó «${q.item.name}»`), RESUME_WAIT_MS),
    };
    paused.current.set(id, p);
    setTransfer(id, { direction: 'in', fraction: tr.current[id]?.fraction ?? 0, state: 'paused' });
    p.ready = flush.then((written) => {
      if (paused.current.get(id) !== p) return;
      if (written < 0) return dropPaused(id, `No se pudo guardar «${q.item.name}»`);
      p.offset = written;
      setTransfer(id, { direction: 'in', fraction: q.item.size ? written / q.item.size : 1, state: 'paused' });
    });
  };

  // El otro dispositivo ha vuelto a anunciar el archivo: la descarga sigue donde se quedó
  const resume = async (id: string, p: Paused) => {
    await p.ready;
    if (paused.current.get(id) !== p) return;
    paused.current.delete(id);
    clearTimeout(p.timer);
    wanted.current.set(id, { item: p.item, dest: p.dest, dl: p.dl, offset: p.offset });
    setTransfer(id, { direction: 'in', fraction: p.item.size ? p.offset / p.item.size : 1, state: 'queued' });
    next();
  };

  // Quita una descarga (en cola, activa o pausada) sin avisar al otro lado
  const dropDownload = (id: string, why: string | null) => {
    const w = wanted.current.get(id);
    if (w) {
      wanted.current.delete(id);
      dropTransfer(id);
      settle(why, discardQueued(w), w.item.name);
    } else if (current.current?.id === id) {
      endActive(current.current, why, false);
    } else {
      dropPaused(id, why);
    }
  };

  // ---------- Enviar ----------

  const finishSend = (id: string, s: Send) => {
    if (sends.current.get(id) !== s) return;
    sends.current.delete(id);
    dropTransfer(id);
  };

  // Para un envío (en cola o en marcha). Devuelve true si había algo que parar.
  const stopOut = (id: string) => {
    const was = queue.current.includes(id) || sends.current.has(id);
    queue.current = queue.current.filter((q) => q !== id);
    offsets.current.delete(id);
    const s = sends.current.get(id);
    if (s) {
      stopSend(s);
      finishSend(id, s);
    }
    dropTransfer(id);
    return was;
  };

  // Envía, uno a uno, los archivos que ha pedido el otro dispositivo
  const pump = async () => {
    if (sending.current) return;
    while (queue.current.length) {
      const id = queue.current.shift()!;
      const file = mine.current.get(id);
      if (!file) {
        post({ t: 'file-cancel', id });
        dropTransfer(id);
        continue;
      }
      const offset = offsets.current.get(id) ?? 0;
      offsets.current.delete(id);
      const s = newSend();
      s.acked = offset;
      sends.current.set(id, s);
      sending.current = id;
      setTransfer(id, { direction: 'out', fraction: file.size ? offset / file.size : 0, state: 'active' });
      try {
        if (await sendFile(channelRef.current, id, file, s, offset)) {
          s.done = true;
          if (s.acked >= file.size) finishSend(id, s); // si no, espera su última confirmación
        } else {
          finishSend(id, s);
        }
      } catch {
        finishSend(id, s);
        if (channelRef.current.readyState === 'open') {
          // el canal sigue vivo: no se pudo leer el archivo (movido, borrado o cambiado)
          post({ t: 'file-cancel', id });
          setNotice(`No se pudo leer «${file.name}»`);
        }
      } finally {
        sending.current = null;
      }
    }
  };

  // ---------- Canal ----------

  // Declarado antes que el efecto del canal: al desmontar, su limpieza corre primero
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
    };
  }, []);

  useEffect(() => {
    channelRef.current = channel;
    setConnected(channel.readyState === 'open');

    // Se pierde el canal (o se cambia por otro). Las descargas quedan en pausa a la espera de que el otro
    // dispositivo vuelva (`final`: se sale de la sala, nada que esperar y se descarta todo); los envíos se paran.
    const lost = (final: boolean) => {
      generation.current++;
      const c = current.current;
      const interrupted = (c !== null && !c.ending) || wanted.current.size > 0 || sends.current.size > 0 || queue.current.length > 0;
      for (const [id, w] of [...wanted.current]) {
        wanted.current.delete(id);
        if (final) {
          dropTransfer(id);
          settle(null, discardQueued(w), w.item.name);
        } else {
          pauseDownload(id, w, Promise.resolve(w.offset));
        }
      }
      if (c && !c.ending) {
        if (c.dl && !final) {
          current.current = null;
          pauseDownload(c.id, { item: c.item, dest: c.dest, dl: c.dl, offset: c.offset }, c.dl.pause());
        } else {
          endActive(c, null, false);
        }
      }
      if (final) for (const id of [...paused.current.keys()]) dropPaused(id, null);
      queue.current = [];
      offsets.current.clear();
      for (const [id, s] of [...sends.current]) {
        stopSend(s);
        finishSend(id, s);
      }
      incomingText.current.clear();
      setFiles((prev) => prev.map((f) => (f.mine || !f.available ? f : { ...f, available: false }))); // lo de los otros queda no disponible
      if (interrupted) setNotice(paused.current.size ? 'Transferencia interrumpida. Continuará si el otro dispositivo vuelve' : 'Transferencia interrumpida');
    };

    // Latido: cualquier mensaje o bloque recibido cuenta como vida; el ping solo asegura que haya algo cada PING_MS
    let lastSeen = performance.now();
    let lastTick = lastSeen;
    const beat = window.setInterval(() => {
      const now = performance.now();
      // Si el propio navegador congeló el temporizador (pestaña dormida), no es culpa del otro: se da otra oportunidad
      if (now - lastTick > 2 * DEAD_MS) lastSeen = now;
      lastTick = now;
      if (channel.readyState !== 'open') return;
      if (now - lastSeen > DEAD_MS) {
        channel.close();
        onClose();
      } else {
        post({ t: 'ping' });
      }
    }, PING_MS);

    const onMessage = (e: MessageEvent) => {
      lastSeen = performance.now();
      if (typeof e.data !== 'string') {
        const c = current.current;
        if (!c?.started || !c.dl) return; // bloques de algo que ya no se espera
        try {
          c.dl.push(e.data as ArrayBuffer);
        } catch {
          endActive(c, `El otro dispositivo envió datos fuera de lo permitido en «${c.item.name}»`, true);
        }
        return;
      }
      const m = parseMsg(e.data);
      if (!m) return;

      switch (m.t) {
        case 'file-add':
          // El otro dispositivo solo puede tocar lo suyo: nunca una entrada mía (conoce mis ids)
          setFiles((prev) => {
            const item: FileItem = { id: m.id, name: m.name, size: m.size, mime: m.mime, mine: false, available: true };
            const old = prev.find((f) => f.id === m.id);
            if (old?.mine) return prev;
            if (old) return prev.map((f) => (f.id === m.id ? item : f));
            return prev.filter((f) => !f.mine).length >= MAX_REMOTE_FILES ? prev : [...prev, item];
          });
          {
            // Si había una descarga pausada de este archivo, continúa; si ya no es el mismo, se descarta
            const p = paused.current.get(m.id);
            if (!p) break;
            if (p.item.name === m.name && p.item.size === m.size) void resume(m.id, p);
            else dropPaused(m.id, `«${p.item.name}» cambió en el otro dispositivo: se descartó lo descargado`);
          }
          break;
        case 'file-remove':
          if (filesRef.current.some((f) => f.id === m.id && f.mine)) break;
          setFiles((prev) => prev.filter((f) => f.id !== m.id || f.mine));
          dropDownload(m.id, 'El otro dispositivo quitó el archivo');
          break;
        case 'file-request': {
          const file = mine.current.get(m.id);
          if (!file) {
            post({ t: 'file-cancel', id: m.id });
            break;
          }
          if (queue.current.includes(m.id) || sends.current.has(m.id)) break;
          const offset = m.offset ?? 0;
          if (!Number.isInteger(offset) || offset < 0 || offset > file.size) {
            post({ t: 'file-cancel', id: m.id });
            break;
          }
          offsets.current.set(m.id, offset);
          queue.current.push(m.id);
          setTransfer(m.id, { direction: 'out', fraction: file.size ? offset / file.size : 0, state: 'queued' });
          void pump();
          break;
        }
        case 'ping':
          post({ t: 'pong' });
          break;
        case 'pong': // solo cuenta como señal de vida
          break;
        case 'file-start': {
          const c = current.current;
          if (c && c.id === m.id && c.dl && !c.started && !c.ending) c.started = true;
          else post({ t: 'file-cancel', id: m.id }); // no lo esperaba: que el emisor pare
          break;
        }
        case 'file-end': {
          const c = current.current;
          if (!c || c.id !== m.id || !c.started || !c.dl) break;
          c.started = false;
          c.ending = true;
          c.dl.end().then(
            () => {
              if (current.current !== c) return;
              current.current = null;
              dropTransfer(c.id);
              next();
            },
            () => {
              c.ending = false;
              endActive(c, `No se pudo guardar «${c.item.name}»: llegó incompleto`, true);
            },
          );
          break;
        }
        case 'file-ack': {
          // Como emisor: el otro dispositivo ha escrito `received` bytes
          const s = sends.current.get(m.id);
          const file = mine.current.get(m.id);
          if (!s || !file || m.received <= s.acked || m.received > file.size) break;
          s.acked = m.received;
          s.wake?.();
          if (s.done && s.acked >= file.size) finishSend(m.id, s);
          else setFraction(m.id, file.size ? s.acked / file.size : 1);
          break;
        }
        case 'file-cancel': {
          // Como receptor: el otro lado no puede (o ya no quiere) enviarlo. Como emisor: el otro lado canceló.
          const why = 'La transferencia se canceló en el otro dispositivo';
          dropDownload(m.id, why);
          if (stopOut(m.id)) setNotice(why);
          break;
        }
        case 'text-add': {
          if (textsRef.current.some((t) => t.id === m.id && t.mine)) break; // un id mío: no se toca
          let buffer = incomingText.current.get(m.id);
          if (!buffer || buffer.parts !== m.parts) {
            if (!buffer && incomingText.current.size >= MAX_INCOMING_TEXTS) break;
            buffer = { parts: m.parts, chunks: new Array(m.parts).fill(undefined) };
            incomingText.current.set(m.id, buffer);
          }
          buffer.chunks[m.part] = m.content;
          if (buffer.chunks.some((p) => p === undefined)) break;
          incomingText.current.delete(m.id);
          const item: TextItem = { id: m.id, format: m.format, content: buffer.chunks.join(''), mine: false };
          setTexts((prev) => {
            if (prev.some((t) => t.id === m.id && t.mine)) return prev;
            const rest = prev.filter((t) => !t.mine && t.id !== m.id);
            const chars = rest.reduce((n, t) => n + t.content.length, 0);
            const known = prev.some((t) => t.id === m.id);
            if (!known && rest.length >= MAX_REMOTE_TEXTS) return prev;
            if (chars + item.content.length > MAX_REMOTE_TEXT_CHARS) return prev;
            return known ? prev.map((t) => (t.id === m.id ? item : t)) : [...prev, item];
          });
          break;
        }
        case 'text-remove':
          incomingText.current.delete(m.id);
          setTexts((prev) => prev.filter((t) => t.id !== m.id || t.mine));
          break;
      }
    };

    const onOpen = () => setConnected(true);
    function onClose() {
      setConnected(false);
      lost(false);
    }

    channel.addEventListener('open', onOpen);
    channel.addEventListener('close', onClose);
    channel.addEventListener('message', onMessage);
    replayEarly(channel, onMessage); // lo que el otro dispositivo envió antes de que esta pantalla escuchara

    // Canal nuevo (o primera vez): el otro dispositivo necesita ver lo mío
    for (const f of filesRef.current) {
      if (f.mine) post({ t: 'file-add', id: f.id, name: f.name, size: f.size, mime: f.mime });
    }
    for (const t of textsRef.current) {
      if (t.mine) postText(t.id, t.format, t.content);
    }

    return () => {
      channel.removeEventListener('open', onOpen);
      channel.removeEventListener('close', onClose);
      channel.removeEventListener('message', onMessage);
      clearInterval(beat);
      lost(gone.current); // el canal se cambia (o se sale de la sala) antes de que llegue su evento close
    };
  }, [channel]);

  // Pantalla encendida: si la pestaña estuvo oculta durante una transferencia, se avisa al volver
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (Object.keys(tr.current).length > 0) hiddenBusy.current = true;
      } else if (hiddenBusy.current) {
        hiddenBusy.current = false;
        setNotice(AWAKE_NOTICE);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(drawTimer.current);
      releaseAwake.current?.();
      releaseAwake.current = null;
    };
  }, []);

  // ---------- Acciones de la pantalla ----------

  const addFiles = useCallback((list: File[]) => {
    const added: FileItem[] = list.map((file) => {
      const id = randomId();
      mine.current.set(id, file);
      return { id, name: file.name, size: file.size, mime: file.type || 'application/octet-stream', mine: true, available: true };
    });
    setFiles((prev) => [...prev, ...added]);
    for (const f of added) post({ t: 'file-add', id: f.id, name: f.name, size: f.size, mime: f.mime });
  }, []);

  const removeFile = useCallback((id: string) => {
    mine.current.delete(id);
    setFiles((prev) => prev.filter((f) => f.id !== id));
    stopOut(id);
    post({ t: 'file-remove', id });
  }, []);

  const addText = useCallback((format: string, content: string) => {
    const id = randomId();
    setTexts((prev) => [...prev, { id, format, content, mine: true }]);
    postText(id, format, content);
  }, []);

  const removeText = useCallback((id: string) => {
    setTexts((prev) => prev.filter((t) => t.id !== id));
    post({ t: 'text-remove', id });
  }, []);

  // Debe llamarse directamente desde el clic: el diálogo de guardar necesita el gesto del usuario.
  // Cada pulsación elige destino y se encola; las descargas se piden al otro dispositivo de una en una.
  const download = useCallback((id: string) => {
    const item = filesRef.current.find((f) => f.id === id);
    if (!item || item.mine || !item.available || wanted.current.has(id) || paused.current.has(id) || current.current?.id === id) return;
    const dialog = hasSavePicker();
    if (dialog) {
      if (picking.current) return void setNotice('Termina de elegir dónde guardar el archivo anterior');
      picking.current = true;
    }
    setNotice(null);
    const gen = generation.current;
    prepareDestination(item)
      .then((dest) => {
        const still = gen === generation.current && filesRef.current.some((f) => f.id === id && f.available);
        if (!still) return settle(null, dest.discard(), item.name); // el archivo o la conexión se fueron mientras se elegía
        wanted.current.set(id, { item, dest, dl: null, offset: 0 });
        setTransfer(id, { direction: 'in', fraction: 0, state: 'queued' });
        next();
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setNotice(err instanceof AvisoError ? err.message : 'No se pudo abrir el destino del archivo');
      })
      .finally(() => {
        if (dialog) picking.current = false;
      });
  }, []);

  // Pide todos los archivos disponibles del otro dispositivo. Debe llamarse directamente desde el clic.
  // Con selector de carpetas se elige una sola vez dónde guardar; sin selector (guardado en memoria) se pide uno a uno.
  const downloadAll = useCallback(async () => {
    const libres = () =>
      filesRef.current.filter((f) => !f.mine && f.available && !wanted.current.has(f.id) && !paused.current.has(f.id) && current.current?.id !== f.id);
    if (!libres().length) return;
    if (!hasFolderPicker()) {
      for (const f of libres()) download(f.id);
      return;
    }
    if (picking.current) return void setNotice('Termina de elegir dónde guardar el archivo anterior');
    picking.current = true;
    setNotice(null);
    const gen = generation.current;
    try {
      const dir = await pickFolder();
      let fallos = 0;
      for (const item of libres()) {
        try {
          const dest = await folderDestination(dir, item);
          if (gen !== generation.current || !filesRef.current.some((f) => f.id === item.id && f.available)) {
            settle(null, dest.discard(), item.name); // el archivo o la conexión se fueron mientras tanto
            continue;
          }
          wanted.current.set(item.id, { item, dest, dl: null, offset: 0 });
          setTransfer(item.id, { direction: 'in', fraction: 0, state: 'queued' });
        } catch {
          fallos++;
        }
      }
      if (fallos) setNotice(`No se pudo preparar el guardado de ${fallos} ${fallos === 1 ? 'archivo' : 'archivos'}`);
      next();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) setNotice('No se pudo abrir la carpeta elegida');
    } finally {
      picking.current = false;
    }
  }, []);

  // Cancela una transferencia propia: una descarga (en cola o en marcha) o un envío
  const cancelDownload = useCallback((id: string) => {
    if (wanted.current.has(id) || paused.current.has(id)) return dropDownload(id, null);
    const c = current.current;
    if (c?.id === id) return endActive(c, null, true);
    if (stopOut(id)) post({ t: 'file-cancel', id });
  }, []);

  return {
    files,
    texts,
    connected,
    transfers,
    notice,
    addFiles,
    removeFile,
    addText,
    removeText,
    download,
    downloadAll,
    cancelDownload,
  };
}
