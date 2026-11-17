import { newToken, normalizeToken } from '../shared/token';

const EXPIRE_MS = 5 * 60_000; // token sin usar
const GRACE_MS = 2 * 60_000; // espera a un dispositivo caído

type Room = {
  token: string;
  createdAt: number;
  // deviceId → momento en que se fue (null = está presente)
  members: Map<string, number | null>;
};

export class Rooms {
  private rooms = new Map<string, Room>();
  private byDevice = new Map<string, string>();

  constructor(private now: () => number = Date.now) {}

  create(deviceId: string): string {
    this.sweep();
    this.dropDevice(deviceId);
    let token = newToken();
    while (this.rooms.has(token)) token = newToken();
    this.rooms.set(token, {
      token,
      createdAt: this.now(),
      members: new Map([[deviceId, null]]),
    });
    this.byDevice.set(deviceId, token);
    return token;
  }

  join(rawToken: string, deviceId: string): 'ok' | 'not_found' | 'full' | 'expired' {
    this.sweep();
    const room = this.rooms.get(normalizeToken(rawToken));
    if (!room) return 'not_found';
    if (room.members.has(deviceId)) {
      // Sala sin emparejar: no se puede unir a su propia sala
      if (room.members.size < 2) return 'not_found';
      // Reconexión de un miembro de una sala emparejada
      room.members.set(deviceId, null);
      return 'ok';
    }
    if (room.members.size >= 2) return 'full';
    if (this.now() - room.createdAt > EXPIRE_MS) return 'expired';
    this.dropDevice(deviceId);
    room.members.set(deviceId, null);
    this.byDevice.set(deviceId, room.token);
    return 'ok';
  }

  // Sala sin emparejar: se cierra. Emparejada: se espera al dispositivo 2 min.
  leave(deviceId: string): void {
    const room = this.roomOf(deviceId);
    if (!room) return;
    if (room.members.size < 2) this.destroy(room);
    else if (room.members.get(deviceId) === null) room.members.set(deviceId, this.now());
  }

  get size(): number {
    return this.rooms.size;
  }

  peerOf(deviceId: string): string | undefined {
    const room = this.roomOf(deviceId);
    if (!room) return undefined;
    for (const id of room.members.keys()) if (id !== deviceId) return id;
    return undefined;
  }

  // Cierra las salas cuya espera ha terminado
  sweep(): void {
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      const abandoned = [...room.members.values()].some((left) => left !== null && now - left > GRACE_MS);
      const stale = room.members.size < 2 && now - room.createdAt > EXPIRE_MS * 2;
      if (abandoned || stale) this.destroy(room);
    }
  }

  private roomOf(deviceId: string): Room | undefined {
    const token = this.byDevice.get(deviceId);
    return token ? this.rooms.get(token) : undefined;
  }

  private dropDevice(deviceId: string): void {
    const room = this.roomOf(deviceId);
    if (room) this.destroy(room);
    this.byDevice.delete(deviceId);
  }

  private destroy(room: Room): void {
    this.rooms.delete(room.token);
    for (const id of room.members.keys()) {
      if (this.byDevice.get(id) === room.token) this.byDevice.delete(id);
    }
  }
}
