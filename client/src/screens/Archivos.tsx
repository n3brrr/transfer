import { useEffect, useRef, useState } from 'react';
import type { Sala } from '../state/sala';
import { formatSize, isMobile } from '../files/transfer';
import { isDangerousName } from '../files/validar';
import { Check, FileArchive, FileText, Film, Image as ImageIcon, Music, Trash2, type LucideIcon } from 'lucide-react';

const movil = isMobile();
const MAX_SOLTADOS = 500;
const SISTEMA = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

const base =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-medium transition active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';
const principal = `${base} bg-acento-texto text-white hover:brightness-95`;
const secundario = `${base} border-2 border-acento-texto text-acento-texto hover:bg-crema`;
// Botón cuadrado solo con icono (papelera)
const icono =
  'inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border-2 border-borde text-acento-texto transition hover:border-acento-texto hover:bg-acento-texto/10 active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta';

// ---------- Tipo de archivo ----------

type Tipo = 'imagen' | 'video' | 'audio' | 'comprimido' | 'documento';

function tipoDe(nombre: string, mime: string): Tipo {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? '';
  if (mime.startsWith('image/')) return 'imagen';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (/zip|rar|7z|tar|gzip/.test(mime) || ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz'].includes(ext)) return 'comprimido';
  return 'documento';
}

const iconos = {
  documento: FileText,
  imagen: ImageIcon,
  video: Film,
  audio: Music,
  comprimido: FileArchive,
} satisfies Record<Tipo, LucideIcon>;

function Icono({ tipo, className = 'size-6' }: { tipo: Tipo; className?: string }) {
  const Componente = iconos[tipo];
  return <Componente aria-hidden="true" strokeWidth={1.7} className={className} />;
}

// ---------- Estado de una transferencia ----------

type Transfer = Sala['transfers'][string];

function estado(t: Transfer): string {
  const porcentaje = `${Math.floor(t.fraction * 100)} %`;
  if (t.state === 'queued') return 'En cola';
  if (t.state === 'paused') return `Pausada · ${porcentaje}`;
  return t.direction === 'out' ? `Enviando… ${porcentaje}` : `Descargando… ${porcentaje}`;
}

// Cuando una transferencia termina bien (no la cancelaron, no falló, el archivo sigue en la lista)
// se muestra "Descargado"/"Enviado" unos segundos
function useCompletados(sala: Sala, cancelados: React.RefObject<Set<string>>) {
  const previo = useRef(sala.transfers);
  const aviso = useRef(sala.notice);
  const [hechos, setHechos] = useState<Record<string, Transfer['direction']>>({});

  useEffect(() => {
    const nuevos: Record<string, Transfer['direction']> = {};
    for (const [id, t] of Object.entries(previo.current)) {
      const cancelado = cancelados.current.delete(id);
      const bien = !sala.transfers[id] && !cancelado && t.state === 'active' && sala.notice === aviso.current;
      if (bien && sala.files.some((f) => f.id === id)) nuevos[id] = t.direction;
    }
    previo.current = sala.transfers;
    aviso.current = sala.notice;
    const ids = Object.keys(nuevos);
    if (!ids.length) return;
    setHechos((h) => ({ ...h, ...nuevos }));
    navigator.vibrate?.(20); // una vibración corta en móviles que lo permiten
    window.setTimeout(
      () =>
        setHechos((h) => {
          const resto = { ...h };
          for (const id of ids) delete resto[id];
          return resto;
        }),
      3500,
    );
  }, [sala.transfers]);

  return hechos;
}

// ---------- Pegar y soltar ----------

const dosCifras = (n: number) => String(n).padStart(2, '0');

// Las capturas pegadas suelen llamarse "image.png": se les pone un nombre legible
function nombrarPegados(lista: File[]): File[] {
  const d = new Date();
  const fecha = `${d.getFullYear()}-${dosCifras(d.getMonth() + 1)}-${dosCifras(d.getDate())}-${dosCifras(d.getHours())}${dosCifras(d.getMinutes())}`;
  let n = 0;
  return lista.map((f) => {
    if (!f.type.startsWith('image/') || !(f.name === '' || /^image\.\w+$/i.test(f.name))) return f;
    const ext = f.type.split('/')[1].replace('jpeg', 'jpg').replace(/\+.*/, '');
    n++;
    return new File([f], `captura-${fecha}${n > 1 ? `-${n}` : ''}.${ext}`, { type: f.type, lastModified: f.lastModified });
  });
}

const esCampoDeTexto = (el: EventTarget | null) =>
  el instanceof Element && el.closest('textarea, input, select, [contenteditable=""], [contenteditable="true"]') !== null;

function leerLote(lector: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((ok) => {
    const todo: FileSystemEntry[] = [];
    const paso = () =>
      lector.readEntries(
        (lote) => {
          if (!lote.length) return ok(todo);
          todo.push(...lote);
          paso();
        },
        () => ok(todo),
      );
    paso();
  });
}

const leerArchivo = (e: FileSystemFileEntry) => new Promise<File | null>((ok) => e.file(ok, () => ok(null)));

type Lectura = { archivos: File[]; truncado: boolean };

async function recorrer(entrada: FileSystemEntry, l: Lectura): Promise<void> {
  if (l.truncado) return;
  try {
    if (entrada.isFile) {
      const f = await leerArchivo(entrada as FileSystemFileEntry);
      if (!f || SISTEMA.has(f.name.toLowerCase())) return;
      if (l.archivos.length >= MAX_SOLTADOS) l.truncado = true;
      else l.archivos.push(f);
    } else if (entrada.isDirectory) {
      for (const hijo of await leerLote((entrada as FileSystemDirectoryEntry).createReader())) await recorrer(hijo, l);
    }
  } catch {
    // una entrada ilegible no impide seguir con las demás
  }
}

// Hay que pedir las entradas dentro del evento drop; después ya no valen
async function leerSoltado(dt: DataTransfer): Promise<Lectura> {
  const items = Array.from(dt.items ?? []).filter((i) => i.kind === 'file');
  const entradas = items.map((i) => ({ entrada: i.webkitGetAsEntry?.() ?? null, archivo: i.getAsFile() }));
  const l: Lectura = { archivos: [], truncado: false };
  if (!entradas.length) {
    l.archivos = Array.from(dt.files);
    return l;
  }
  for (const { entrada, archivo } of entradas) {
    if (entrada) await recorrer(entrada, l);
    else if (archivo && !SISTEMA.has(archivo.name.toLowerCase())) l.archivos.push(archivo);
  }
  return l;
}

// ---------- Pantalla ----------

export default function Archivos({ sala }: { sala: Sala }) {
  const cancelados = useRef(new Set<string>()); // cancelaciones hechas por el usuario
  const hechos = useCompletados(sala, cancelados);
  const raiz = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const salaRef = useRef(sala);
  salaRef.current = sala;
  const [encima, setEncima] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const transfiriendo = Object.keys(sala.transfers).length > 0;

  useEffect(() => {
    // Archivos y Texto están montados a la vez: solo actúa la pestaña visible
    const visible = () => raiz.current !== null && raiz.current.offsetParent !== null;
    const traeArchivos = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
    let dentro = 0;

    const onPaste = (e: ClipboardEvent) => {
      if (!visible() || esCampoDeTexto(e.target)) return;
      const lista = Array.from(e.clipboardData?.files ?? []);
      if (!lista.length) return;
      e.preventDefault();
      setAviso(null);
      salaRef.current.addFiles(nombrarPegados(lista));
    };
    const onDragEnter = (e: DragEvent) => {
      if (!visible() || !traeArchivos(e)) return;
      dentro++;
      setEncima(true);
    };
    const onDragLeave = () => {
      dentro = Math.max(0, dentro - 1);
      if (!dentro) setEncima(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (visible() && traeArchivos(e)) e.preventDefault(); // sin esto el navegador abriría el archivo
    };
    const onDrop = (e: DragEvent) => {
      dentro = 0;
      setEncima(false);
      if (!visible() || !traeArchivos(e) || !e.dataTransfer) return;
      e.preventDefault();
      setAviso(null);
      setLeyendo(true);
      leerSoltado(e.dataTransfer)
        .then(({ archivos, truncado }) => {
          if (archivos.length) salaRef.current.addFiles(archivos);
          if (truncado) setAviso(`Solo se añadieron los primeros ${MAX_SOLTADOS} archivos; el resto se omitió.`);
          else if (!archivos.length) setAviso('No se encontraron archivos para añadir.');
        })
        .catch(() => setAviso('No se pudo leer lo que soltaste.'))
        .finally(() => setLeyendo(false));
    };

    document.addEventListener('paste', onPaste);
    document.addEventListener('dragenter', onDragEnter);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragenter', onDragEnter);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('drop', onDrop);
    };
  }, []);

  const avisos = [sala.notice, aviso].filter(Boolean) as string[];
  const mostrarConsejo = movil && transfiriendo && !sala.notice?.startsWith('Mantén la pantalla');

  return (
    <section ref={raiz}>
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={`mb-1 flex min-h-32 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center text-base font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tinta ${encima ? 'border-acento-texto bg-superficie text-acento-texto' : 'border-borde bg-superficie/60 hover:bg-superficie'}`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-9 text-acento transition-transform duration-200 ${encima ? '-translate-y-1.5 scale-125' : ''}`}
        >
          <path d="M12 16V5M7 10l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
        </svg>
        {leyendo ? 'Leyendo archivos…' : movil ? 'Toca para añadir archivos' : encima ? 'Suéltalos para añadirlos' : 'Suelta archivos aquí o pulsa para añadir'}
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          setAviso(null);
          sala.addFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      {!movil && <p className="mb-3 text-center text-xs text-suave">También puedes soltar carpetas o pegar con Ctrl+V</p>}
      {movil && <div className="mb-3" />}

      <div role="status" aria-live="polite">
        {avisos.map((texto) => (
          <p key={texto} className="mb-3 rounded-xl border border-acento-texto bg-superficie px-3 py-2 text-sm text-acento-texto [overflow-wrap:anywhere]">
            {texto}
          </p>
        ))}
      </div>

      {mostrarConsejo && (
        <p className="mb-3 flex items-start gap-2 rounded-xl bg-superficie px-3 py-2 text-sm">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-acento"
          >
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          Mantén la pantalla encendida mientras dura la transferencia
        </p>
      )}

      {sala.files.length === 0 ? (
        <div className="rounded-2xl border border-borde bg-superficie px-4 py-8 text-center">
          <Icono tipo="documento" className="mx-auto mb-2 size-10 text-borde" />
          <p className="font-medium">Aún no hay archivos</p>
          <p className="mt-1 text-sm text-suave">Los que añadas aquí o en el otro dispositivo aparecerán en esta lista.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {sala.files.map((f) => {
            const t = sala.transfers[f.id];
            const porcentaje = t ? Math.floor(t.fraction * 100) : 0;
            return (
              <li key={f.id} className="entra flex flex-col gap-3 rounded-2xl border border-borde bg-superficie p-3 sm:flex-row sm:items-center">
                <div className={`flex min-w-0 flex-1 items-start gap-3 ${f.available ? '' : 'opacity-60'}`}>
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-crema text-acento">
                    <Icono tipo={tipoDe(f.name, f.mime)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-medium [overflow-wrap:anywhere]" title={f.name}>
                      {f.name}
                    </p>
                    <p className="text-xs text-suave">
                      {formatSize(f.size)} · {f.mine ? 'Este dispositivo' : 'Otro dispositivo'}
                      {!f.available && ' · No disponible'}
                    </p>
                    {!f.mine && isDangerousName(f.name) && (
                      <p className="mt-1 text-xs font-medium text-acento-texto">Archivo ejecutable: ábrelo solo si lo esperabas y confías en el otro dispositivo</p>
                    )}
                    {t && (
                      <div className="mt-2">
                        <p className="mb-1 text-xs font-medium">{estado(t)}</p>
                        {t.state !== 'queued' && (
                          <div
                            role="progressbar"
                            aria-label={estado(t)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={porcentaje}
                            className={`barra ${t.state === 'paused' ? 'barra-pausada' : ''}`}
                          >
                            <div className="barra-relleno" style={{ width: `${porcentaje}%` }} />
                          </div>
                        )}
                      </div>
                    )}
                    {!t && hechos[f.id] && (
                      <p role="status" className="hecho mt-1 flex items-center gap-1 text-xs font-medium">
                        <Check className="size-4 text-ok" strokeWidth={3} aria-hidden="true" />
                        {hechos[f.id] === 'in' ? 'Descargado' : 'Enviado'}
                      </p>
                    )}
                  </div>
                </div>
                {(t || f.mine || (f.available && !f.mine)) && (
                  <div className="flex flex-wrap justify-end gap-2 sm:shrink-0 sm:flex-nowrap">
                    {!f.mine && f.available && !t && (
                      <button type="button" className={`${principal} flex-1 basis-32 sm:flex-none`} aria-label={`Descargar ${f.name}`} onClick={() => sala.download(f.id)}>
                        Descargar
                      </button>
                    )}
                    {t && (
                      <button
                        type="button"
                        className={`${secundario} flex-1 basis-32 sm:flex-none`}
                        aria-label={`Cancelar ${f.name}`}
                        onClick={() => {
                          cancelados.current.add(f.id);
                          sala.cancelDownload(f.id);
                        }}
                      >
                        Cancelar
                      </button>
                    )}
                    {f.mine && (
                      <button type="button" className={icono} aria-label={`Quitar ${f.name}`} title="Quitar archivo" onClick={() => sala.removeFile(f.id)}>
                        <Trash2 className="size-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
