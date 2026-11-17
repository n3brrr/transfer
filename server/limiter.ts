const WINDOW_MS = 60_000;
// Tokens de 8 caracteres sobre 31 símbolos: 31^8 ≈ 8,5·10^11 combinaciones. Con 20 fallos/min por IP
// y un token que vive 5 min, una IP prueba ~100 tokens: probabilidad de acierto despreciable.
const MAX_FAILURES = 20;
// Tope para todo el servidor: frena un ataque repartido entre muchas IPs
const MAX_FAILURES_GLOBAL = 200;
const GLOBAL = '*';
// Salas que una misma IP puede crear por minuto: sin tope, unas pocas IPs llenarían las 200 salas
const MAX_CREATES = 10;

const failures = new Map<string, number[]>();
const creations = new Map<string, number[]>();
let blocked = 0; // peticiones rechazadas desde la última lectura; sin IPs ni datos personales

function recent(key: string, now: number): number[] {
  const list = (failures.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length) failures.set(key, list);
  else failures.delete(key);
  return list;
}

function add(key: string, now: number): void {
  const list = recent(key, now);
  list.push(now);
  failures.set(key, list);
}

// true mientras ni la IP ni el servidor hayan llegado a su tope de fallos en el último minuto
export function allowAttempt(ip: string, now: number = Date.now()): boolean {
  const ok = recent(ip, now).length < MAX_FAILURES && recent(GLOBAL, now).length < MAX_FAILURES_GLOBAL;
  if (!ok) blocked++;
  return ok;
}

// Anota una creación de sala y dice si esa IP aún no ha llegado a su tope por minuto
export function allowCreate(ip: string, now: number = Date.now()): boolean {
  const list = (creations.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_CREATES) {
    creations.set(ip, list);
    blocked++;
    return false;
  }
  list.push(now);
  creations.set(ip, list);
  return true;
}

// Devuelve cuántas peticiones se rechazaron desde la última vez y lo pone a cero
export function takeBlocked(): number {
  const n = blocked;
  blocked = 0;
  return n;
}

export function registerFailure(ip: string, now: number = Date.now()): void {
  add(ip, now);
  add(GLOBAL, now);
}

// Olvida las IPs sin fallos recientes para que el mapa no crezca
export function sweepFailures(now: number = Date.now()): void {
  for (const key of [...failures.keys()]) recent(key, now);
  for (const [ip, list] of [...creations]) {
    const vivos = list.filter((t) => now - t < WINDOW_MS);
    if (vivos.length) creations.set(ip, vivos);
    else creations.delete(ip);
  }
}
