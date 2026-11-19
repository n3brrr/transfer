export const CHUNK_SIZE = 65536 // tamaño de cada mensaje por el canal (más de 64 KB no interopera con todos los navegadores). Medido: 16, 32 y 64 KB dentro del ruido (5,6 / 6,7 / 5,9 MB/s); 64 KB fue el mejor sin la app (7,1 frente a 4,7 MB/s con 16 KB)
const READ_SIZE = 2 * 1024 * 1024 // se lee del disco de 2 MB en 2 MB y se reparte en bloques
const FLUSH_SIZE = 1024 * 1024 // el receptor escribe (y confirma) de 1 MB en 1 MB
const MAX_PENDING = 32 * 1024 * 1024 // tope de bytes recibidos y aún sin escribir

// Los bloques son vistas sobre el mismo búfer (sin copias). Se lee por adelantado el siguiente trozo.
// `start`: byte desde el que se empieza (para reanudar).
export async function* chunks(
  file: Blob,
  size = CHUNK_SIZE,
  start = 0,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const read = (offset: number) => {
    const p = file.slice(offset, offset + READ_SIZE).arrayBuffer()
    p.catch(() => {}) // si nadie llega a esperarlo, que no salte como error sin capturar
    return p
  }
  let next = start < file.size ? read(start) : null
  for (let offset = start; next; offset += READ_SIZE) {
    const block = await next
    next = offset + READ_SIZE < file.size ? read(offset + READ_SIZE) : null
    for (let i = 0; i < block.byteLength; i += size)
      yield new Uint8Array(block, i, Math.min(size, block.byteLength - i))
  }
}

// Junta los bloques recibidos y los escribe en tandas de ~1 MB, de una en una y en orden.
// `onWritten` recibe el total ya escrito; `onError`, el primer fallo de escritura.
export function receiver(
  expectedSize: number,
  write: (data: Blob) => Promise<void>,
  onWritten: (total: number) => void = () => {},
  onError: (err: unknown) => void = () => {},
) {
  let received = 0
  let written = 0
  let pending: ArrayBuffer[] = []
  let pendingBytes = 0
  let running: Promise<void> | null = null
  let failed: unknown = null

  async function drain(all: boolean) {
    while (!failed && pendingBytes > 0 && (all || pendingBytes >= FLUSH_SIZE)) {
      const batch = pending
      const bytes = pendingBytes
      pending = []
      pendingBytes = 0
      try {
        await write(new Blob(batch))
      } catch (err) {
        if (!failed) {
          failed = err
          onError(err)
        }
        return
      }
      written += bytes
      if (!failed) onWritten(written)
    }
  }
  const kick = (all: boolean) =>
    (running ??= drain(all).finally(() => (running = null)))

  return {
    // Lanza error si llegan más bytes de los esperados
    push(chunk: ArrayBuffer): void {
      if (failed) return
      received += chunk.byteLength
      if (received > expectedSize)
        throw new Error(
          `Llegaron más datos de los esperados (${expectedSize} bytes)`,
        )
      // El emisor respeta una ventana de 8 MB sin confirmar; quien la ignore no puede llenar la memoria
      if (pendingBytes + chunk.byteLength > MAX_PENDING)
        throw new Error('Llegan datos más rápido de lo permitido')
      pending.push(chunk)
      pendingBytes += chunk.byteLength
      if (pendingBytes >= FLUSH_SIZE) void kick(false)
    },
    // Escribe lo que quede. Lanza error si falló una escritura o no ha llegado exactamente el tamaño esperado
    async finish(): Promise<void> {
      await running
      await kick(true)
      if (failed) throw failed
      if (received !== expectedSize)
        throw new Error(
          `Tamaño incorrecto: ${received} de ${expectedSize} bytes`,
        )
    },
    // Escribe lo que quede sin cerrar nada (para pausar) y devuelve los bytes escritos, o -1 si falló una escritura.
    // Después se pueden seguir recibiendo bloques a continuación.
    async flush(): Promise<number> {
      await running
      await kick(true)
      return failed ? -1 : written
    },
    // Descarta lo pendiente; lo que ya esté escribiéndose termina o falla sin avisar
    abort(): void {
      failed ??= new Error('Descarga cancelada')
      pending = []
      pendingBytes = 0
    },
  }
}
