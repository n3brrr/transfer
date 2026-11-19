import type { FromServer, ToServer } from '../../../shared/protocolo/protocol'
import { randomId } from '../../../shared/token/token'

export type Signaling = {
  send(m: ToServer): void
  // Devuelve la función para dejar de escuchar
  on(cb: (m: FromServer) => void): () => void
  onClose(cb: () => void): void
  close(): void
}

export function connectSignaling(): Signaling {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${location.host}/ws`)
  const pending: string[] = []
  const listeners = new Set<(m: FromServer) => void>()
  const closers: Array<() => void> = []

  ws.onopen = () => pending.splice(0).forEach((s) => ws.send(s))
  ws.onmessage = (e) => {
    let m: FromServer
    try {
      m = JSON.parse(String(e.data)) as FromServer
    } catch {
      return // mensaje no válido: se ignora
    }
    if (!m || typeof m !== 'object') return
    // Un fallo en un oyente no debe impedir que los demás reciban el mensaje
    for (const cb of [...listeners]) {
      try {
        cb(m)
      } catch (err) {
        console.error(err)
      }
    }
  }
  ws.onclose = () => {
    const avisar = closers.splice(0)
    listeners.clear()
    pending.length = 0
    avisar.forEach((cb) => cb())
  }

  return {
    send(m) {
      const s = JSON.stringify(m)
      if (ws.readyState === WebSocket.OPEN) ws.send(s)
      else if (ws.readyState === WebSocket.CONNECTING) pending.push(s)
    },
    on(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    onClose(cb) {
      closers.push(cb)
    },
    close() {
      pending.length = 0
      ws.close()
    },
  }
}

// Datos que sobreviven a recargar la página (solo mientras la pestaña siga abierta)
const DEVICE_KEY = 'transferir.deviceId'
const TOKEN_KEY = 'transferir.token'
let memoryId: string | null = null

export function getDeviceId(): string {
  try {
    const saved = sessionStorage.getItem(DEVICE_KEY)
    if (saved) return saved
    const id = randomId()
    sessionStorage.setItem(DEVICE_KEY, id)
    return id
  } catch {
    memoryId ??= randomId()
    return memoryId
  }
}

export function saveToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // sin almacenamiento: no se podrá volver tras recargar
  }
}

export function loadToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // nada que borrar
  }
}
