import type { PeerMsg } from '../../../shared/protocol'
import { chunks, receiver } from './chunker'

// Control de flujo del emisor: no hay más de WINDOW bytes sin confirmar (escritos) por el receptor
// y el búfer de salida del canal no pasa de HIGH_WATER. Medido con 100 MB entre dos pestañas de Chrome: 1/0,25/2 MB, 4/1/8 MB y
// 8/2/16 MB rindieron igual (5,4 a 5,7 MB/s de media; el límite lo pone la red local de la prueba, no estos valores).
const HIGH_WATER = 4 * 1024 * 1024
const LOW_WATER = 1024 * 1024
const WINDOW = 8 * 1024 * 1024

// Respaldo en memoria (sin showSaveFilePicker): se avisa por encima del umbral y se rechaza por encima del máximo
const MEMORY_WARNING_PC = 500 * 1024 * 1024
const MEMORY_WARNING_MOBILE = 200 * 1024 * 1024
const MEMORY_MAX = 1536 * 1024 * 1024

// Error cuyo mensaje se puede enseñar tal cual al usuario
export class AvisoError extends Error {}

// Estado de un envío. `acked` lo actualiza quien reciba los file-ack; `wake` despierta al envío si está esperando.
export type Send = {
  stop: boolean
  done: boolean
  acked: number
  wake: (() => void) | null
}
export const newSend = (): Send => ({
  stop: false,
  done: false,
  acked: 0,
  wake: null,
})
export function stopSend(s: Send): void {
  s.stop = true
  s.wake?.()
}

export type Download = {
  push(chunk: ArrayBuffer): void // lanza error si llegan más bytes de los esperados
  pause(): Promise<number> // escribe lo pendiente SIN cerrar el destino; devuelve los bytes escritos (-1 si falló)
  end(): Promise<void> // escribe lo pendiente y guarda; si falla, ya lo ha descartado
  abort(): Promise<boolean> // descarta; true si no queda nada en disco (idempotente)
}

// Sitio donde guardar un archivo, elegido en el gesto del usuario (el diálogo de guardado lo exige)
export type Destination = {
  start(
    onWritten: (total: number) => void,
    onError: (err: unknown) => void,
  ): Promise<Download>
  discard(): Promise<boolean> // se descarta sin haber empezado; true si no queda nada en disco
}

type FileInfo = { name: string; size: number; mime: string }

type Writable = {
  write(data: Blob): Promise<void>
  close(): Promise<void>
  abort(): Promise<void>
}
type SaveHandle = {
  createWritable(): Promise<Writable>
  getFile(): Promise<File>
  remove?(): Promise<void> // no existe en todos los navegadores
}
type SavePicker = (options: { suggestedName: string }) => Promise<SaveHandle>

const savePicker = () =>
  (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker

export const hasSavePicker = () => typeof savePicker() === 'function'

// Carpeta elegida una sola vez para guardar varios archivos (Descargar todos)
type DirHandle = {
  getFileHandle(
    name: string,
    options?: { create?: boolean },
  ): Promise<SaveHandle>
}
type DirPicker = (options: { mode: 'readwrite' }) => Promise<DirHandle>
const dirPicker = () =>
  (window as unknown as { showDirectoryPicker?: DirPicker }).showDirectoryPicker
export const hasFolderPicker = () => typeof dirPicker() === 'function'
export type Folder = DirHandle
// Hay que llamarla directamente desde el clic. Lanza AbortError si el usuario cancela.
export const pickFolder = (): Promise<Folder> =>
  dirPicker()!.call(window, { mode: 'readwrite' })

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[i]}`
}

// Tiempo restante en pocas palabras: «12 s», «3 min», «1 h 05 min»
export function formatEta(seconds: number): string {
  const s = Math.max(1, Math.round(seconds))
  if (s < 60) return `${s} s`
  const min = Math.round(s / 60)
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min`
}

export function isMobile(): boolean {
  const mobile = (
    navigator as unknown as { userAgentData?: { mobile?: boolean } }
  ).userAgentData?.mobile
  if (typeof mobile === 'boolean') return mobile
  // iPadOS se hace pasar por un Mac
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (/Mac/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

function post(ch: RTCDataChannel, m: PeerMsg): void {
  ch.send(JSON.stringify(m))
}

const full = (ch: RTCDataChannel, s: Send, sent: number) =>
  ch.bufferedAmount > HIGH_WATER || sent - s.acked >= WINDOW

// Espera a que haya sitio: el búfer baja, llega un file-ack, se cancela o se cierra el canal
function waitRoom(ch: RTCDataChannel, s: Send): Promise<void> {
  return new Promise((resolve, reject) => {
    const off = () => {
      ch.removeEventListener('bufferedamountlow', ok)
      ch.removeEventListener('close', lost)
      s.wake = null
    }
    const ok = () => (off(), resolve())
    const lost = () => (off(), reject(new Error('Conexión perdida')))
    s.wake = ok
    ch.addEventListener('bufferedamountlow', ok)
    ch.addEventListener('close', lost)
  })
}

// Devuelve false si se canceló por el camino; lanza error si se pierde la conexión o no se puede leer el archivo.
// `offset`: se envía desde ese byte (el receptor ya lo tiene y `s.acked` debe empezar ahí).
export async function sendFile(
  ch: RTCDataChannel,
  id: string,
  file: Blob,
  s: Send,
  offset = 0,
): Promise<boolean> {
  ch.bufferedAmountLowThreshold = LOW_WATER
  post(ch, { t: 'file-start', id })
  let sent = offset
  for await (const chunk of chunks(file, undefined, offset)) {
    while (!s.stop && full(ch, s, sent)) await waitRoom(ch, s)
    if (s.stop) return false
    ch.send(chunk)
    sent += chunk.byteLength
  }
  if (s.stop) return false
  post(ch, { t: 'file-end', id })
  return true
}

// Aviso previo (antes de pulsar Descargar) para archivos grandes en navegadores que guardan en memoria; null si no hace falta
export function memoryNotice(size: number): string | null {
  if (hasSavePicker()) return null
  if (size > MEMORY_MAX)
    return `Pesa más de ${formatSize(MEMORY_MAX)}: este navegador no puede guardarlo. Descárgalo desde Chrome o Edge en un ordenador.`
  if (size > (isMobile() ? MEMORY_WARNING_MOBILE : MEMORY_WARNING_PC))
    return 'Este navegador lo guarda en memoria antes de descargarlo y puede quedarse sin ella.'
  return null
}

// Prepara dónde guardar el archivo. Hay que llamarla directamente desde el clic (sin esperas antes):
// showSaveFilePicker exige un gesto del usuario. Lanza AbortError si el usuario cancela, o AvisoError.
export async function prepareDestination(item: FileInfo): Promise<Destination> {
  const picker = savePicker()
  if (picker)
    return pickedDestination(
      item,
      await picker.call(window, { suggestedName: item.name }),
    )

  if (item.size > MEMORY_MAX) {
    throw new AvisoError(
      `«${item.name}» pesa ${formatSize(item.size)} y este navegador no puede guardar más de ${formatSize(MEMORY_MAX)}. Descárgalo desde un ordenador con Chrome o Edge.`,
    )
  }
  const warning = isMobile() ? MEMORY_WARNING_MOBILE : MEMORY_WARNING_PC
  if (
    item.size > warning &&
    !confirm(
      `«${item.name}» pesa ${formatSize(item.size)}. Este navegador lo guarda en memoria antes de descargarlo y puede quedarse sin ella. ¿Continuar?`,
    )
  ) {
    throw new DOMException('Descarga cancelada', 'AbortError')
  }
  return memoryDestination(item)
}

// Destino dentro de una carpeta ya elegida. Nunca pisa un archivo existente: si el nombre está cogido, añade « (1)», « (2)»…
export async function folderDestination(
  dir: Folder,
  item: FileInfo,
): Promise<Destination> {
  const dot = item.name.lastIndexOf('.')
  const base = dot > 0 ? item.name.slice(0, dot) : item.name
  const ext = dot > 0 ? item.name.slice(dot) : ''
  for (let i = 0; i < 1000; i++) {
    const name = i === 0 ? item.name : `${base} (${i})${ext}`
    const taken = await dir.getFileHandle(name).then(
      () => true,
      (err) => {
        if (err instanceof DOMException && err.name === 'NotFoundError')
          return false
        throw err
      },
    )
    if (!taken)
      return pickedDestination(
        item,
        await dir.getFileHandle(name, { create: true }),
      )
  }
  throw new AvisoError(`No se encontró un nombre libre para «${item.name}»`)
}

// Escritura directa a disco: no ocupa memoria aunque el archivo sea de varios GB
async function pickedDestination(
  item: FileInfo,
  handle: SaveHandle,
): Promise<Destination> {
  // El diálogo crea el archivo vacío. Si ya existía con contenido, no se borra nunca (cancelar deja el original intacto).
  const existed = await handle.getFile().then(
    (f) => f.size > 0,
    () => true,
  )
  let removal: Promise<boolean> | null = null
  const remove = () =>
    (removal ??= (async () => {
      if (existed) return true
      try {
        if (typeof handle.remove !== 'function') return false
        await handle.remove()
        return true
      } catch {
        return false
      }
    })())

  return {
    async start(onWritten, onError) {
      const out = await handle.createWritable()
      const rec = receiver(
        item.size,
        (data) => out.write(data),
        onWritten,
        onError,
      )
      let aborting: Promise<boolean> | null = null
      const abort = () =>
        (aborting ??= (async () => {
          rec.abort()
          await out.abort().catch(() => {})
          return remove()
        })())
      return {
        push: rec.push,
        pause: rec.flush,
        async end() {
          try {
            await rec.finish()
            await out.close()
          } catch (err) {
            await abort()
            throw err
          }
        },
        abort,
      }
    },
    discard: remove,
  }
}

// Respaldo en memoria: se junta todo y se baja con <a download> al final
function memoryDestination(item: FileInfo): Destination {
  return {
    async start(onWritten, onError) {
      const parts: Blob[] = []
      const rec = receiver(
        item.size,
        async (data) => void parts.push(data),
        onWritten,
        onError,
      )
      return {
        push: rec.push,
        pause: rec.flush,
        async end() {
          try {
            await rec.finish()
            const url = URL.createObjectURL(
              new Blob(parts, { type: item.mime }),
            )
            const a = document.createElement('a')
            a.href = url
            a.download = item.name
            a.click()
            setTimeout(() => URL.revokeObjectURL(url), 60_000)
          } finally {
            parts.length = 0
          }
        },
        async abort() {
          rec.abort()
          parts.length = 0
          return true
        },
      }
    },
    discard: async () => true,
  }
}

// Mantiene la pantalla encendida. El navegador suelta el bloqueo al ocultar la pestaña: se pide otra vez al volver.
// Devuelve la función para soltarlo.
export function keepAwake(): () => void {
  let lock: WakeLockSentinel | null = null
  let released = false
  const acquire = async () => {
    if (released || lock || document.visibilityState !== 'visible') return
    try {
      const l = await navigator.wakeLock?.request('screen')
      if (!l) return
      if (released) return void l.release().catch(() => {})
      lock = l
      l.addEventListener('release', () => {
        if (lock === l) lock = null
      })
    } catch {
      // sin permiso o sin soporte: la transferencia sigue igual
    }
  }
  const onVisible = () => void acquire()
  document.addEventListener('visibilitychange', onVisible)
  void acquire()
  return () => {
    released = true
    document.removeEventListener('visibilitychange', onVisible)
    lock?.release().catch(() => {})
    lock = null
  }
}
