import { newToken, normalizeToken } from '../../shared/token/token'

const EXPIRE_MS = 5 * 60_000 // token sin usar
const GRACE_MS = 2 * 60_000 // espera a un dispositivo caído
const PENDING_MS = 60_000 // tiempo que el creador tiene para aceptar o rechazar a quien quiere unirse

type Room = {
  token: string
  createdAt: number
  // deviceId → momento en que se fue (null = está presente)
  members: Map<string, number | null>
  // Dispositivo que ha pedido unirse y espera la respuesta del creador (aún no es miembro)
  pending: { deviceId: string; at: number } | null
}

export class Rooms {
  private rooms = new Map<string, Room>()
  private byDevice = new Map<string, string>()
  private pendingByDevice = new Map<string, string>() // solicitante → token de la sala a la que pide entrar

  constructor(private now: () => number = Date.now) {}

  create(deviceId: string): string {
    this.sweep()
    this.clearPending(deviceId)
    this.dropDevice(deviceId)
    let token = newToken()
    while (this.rooms.has(token)) token = newToken()
    this.rooms.set(token, {
      token,
      createdAt: this.now(),
      members: new Map([[deviceId, null]]),
      pending: null,
    })
    this.byDevice.set(deviceId, token)
    return token
  }

  // 'ok': un miembro de una sala emparejada vuelve. 'pending': un dispositivo nuevo queda a la espera de que el creador lo acepte.
  join(
    rawToken: string,
    deviceId: string,
  ): 'ok' | 'pending' | 'not_found' | 'full' | 'expired' {
    this.sweep()
    const room = this.rooms.get(normalizeToken(rawToken))
    if (!room) return 'not_found'
    if (room.members.has(deviceId)) {
      // Sala sin emparejar: no se puede unir a su propia sala
      if (room.members.size < 2) return 'not_found'
      // Reconexión de un miembro de una sala emparejada
      room.members.set(deviceId, null)
      return 'ok'
    }
    if (room.members.size >= 2) return 'full'
    if (this.now() - room.createdAt > EXPIRE_MS) return 'expired'
    if (room.pending) return 'full' // otro dispositivo ya está esperando respuesta
    this.clearPending(deviceId)
    this.dropDevice(deviceId)
    room.pending = { deviceId, at: this.now() }
    this.pendingByDevice.set(deviceId, room.token)
    return 'pending'
  }

  // El creador acepta: el solicitante pasa a ser miembro. Devuelve su id, o null si no había solicitud.
  accept(creatorId: string): string | null {
    const room = this.roomOf(creatorId)
    if (!room?.pending || room.members.size >= 2) return null
    const joiner = room.pending.deviceId
    room.pending = null
    this.pendingByDevice.delete(joiner)
    room.members.set(joiner, null)
    this.byDevice.set(joiner, room.token)
    return joiner
  }

  // El creador rechaza. Devuelve el id del solicitante, o null si no había solicitud.
  reject(creatorId: string): string | null {
    const joiner = this.roomOf(creatorId)?.pending?.deviceId ?? null
    if (joiner) this.clearPending(joiner)
    return joiner
  }

  // El solicitante se retira. Devuelve el id del creador al que hay que avisar, si había solicitud.
  cancelPending(joinerId: string): string | undefined {
    const creator = this.pendingFor(joinerId)
    if (creator) this.clearPending(joinerId)
    return creator
  }

  // Solicitante que espera respuesta en la sala de este creador
  pendingOf(creatorId: string): string | undefined {
    return this.roomOf(creatorId)?.pending?.deviceId
  }

  // Creador al que este solicitante espera
  pendingFor(joinerId: string): string | undefined {
    const token = this.pendingByDevice.get(joinerId)
    const room = token ? this.rooms.get(token) : undefined
    return room ? room.members.keys().next().value : undefined
  }

  // Cierra las solicitudes que llevan demasiado sin respuesta y devuelve los dos implicados
  expirePending(): { creator: string; joiner: string }[] {
    const now = this.now()
    const out: { creator: string; joiner: string }[] = []
    for (const room of this.rooms.values()) {
      if (!room.pending || now - room.pending.at <= PENDING_MS) continue
      out.push({
        creator: room.members.keys().next().value!,
        joiner: room.pending.deviceId,
      })
      this.clearPending(room.pending.deviceId)
    }
    return out
  }

  // Sala sin emparejar: se cierra. Emparejada: se espera al dispositivo 2 min.
  leave(deviceId: string): void {
    const room = this.roomOf(deviceId)
    if (!room) return
    if (room.members.size < 2) this.destroy(room)
    else if (room.members.get(deviceId) === null)
      room.members.set(deviceId, this.now())
  }

  get size(): number {
    return this.rooms.size
  }

  peerOf(deviceId: string): string | undefined {
    const room = this.roomOf(deviceId)
    if (!room) return undefined
    for (const id of room.members.keys()) if (id !== deviceId) return id
    return undefined
  }

  // Cierra las salas cuya espera ha terminado
  sweep(): void {
    const now = this.now()
    for (const room of [...this.rooms.values()]) {
      const abandoned = [...room.members.values()].some(
        (left) => left !== null && now - left > GRACE_MS,
      )
      const stale =
        room.members.size < 2 && now - room.createdAt > EXPIRE_MS * 2
      if (abandoned || stale) this.destroy(room)
    }
  }

  private roomOf(deviceId: string): Room | undefined {
    const token = this.byDevice.get(deviceId)
    return token ? this.rooms.get(token) : undefined
  }

  private clearPending(joinerId: string): void {
    const token = this.pendingByDevice.get(joinerId)
    this.pendingByDevice.delete(joinerId)
    const room = token ? this.rooms.get(token) : undefined
    if (room?.pending?.deviceId === joinerId) room.pending = null
  }

  private dropDevice(deviceId: string): void {
    const room = this.roomOf(deviceId)
    if (room) this.destroy(room)
    this.byDevice.delete(deviceId)
  }

  private destroy(room: Room): void {
    this.rooms.delete(room.token)
    if (room.pending) this.pendingByDevice.delete(room.pending.deviceId)
    for (const id of room.members.keys()) {
      if (this.byDevice.get(id) === room.token) this.byDevice.delete(id)
    }
  }
}
