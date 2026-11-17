// Generador mínimo de códigos QR: modo byte, corrección de errores M y versiones 1 a 7 (hasta 122 bytes).
// Solo sirve para el enlace de la sala; no hace falta nada más y así no se añade ninguna dependencia.

type Version = { ec: number; bloques: number[]; alineacion: number[] }; // bytes de datos de cada bloque
const VERSIONES: Record<number, Version> = {
  1: { ec: 10, bloques: [16], alineacion: [] },
  2: { ec: 16, bloques: [28], alineacion: [6, 18] },
  3: { ec: 26, bloques: [44], alineacion: [6, 22] },
  4: { ec: 18, bloques: [32, 32], alineacion: [6, 26] },
  5: { ec: 24, bloques: [43, 43], alineacion: [6, 30] },
  6: { ec: 16, bloques: [27, 27, 27, 27], alineacion: [6, 34] },
  7: { ec: 18, bloques: [31, 31, 31, 31], alineacion: [6, 22, 38] },
};
const NIVEL_M = 0; // bits del nivel de corrección M en la información de formato

// ---------- Reed-Solomon sobre GF(256) ----------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

// Coeficientes del polinomio generador, del grado más alto al más bajo (el primero siempre es 1)
function generador(grado: number): number[] {
  let g = [1];
  for (let i = 0; i < grado; i++) {
    const n = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      n[j] ^= g[j];
      n[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = n;
  }
  return g;
}

function restoReedSolomon(datos: number[], grado: number): number[] {
  const g = generador(grado);
  const r = new Array<number>(grado).fill(0);
  for (const d of datos) {
    const f = d ^ r.shift()!;
    r.push(0);
    for (let i = 0; i < grado; i++) r[i] ^= mul(g[i + 1], f);
  }
  return r;
}

// ---------- Datos ----------

const capacidad = (v: Version) => v.bloques.reduce((a, b) => a + b, 0);

function palabrasDeDatos(bytes: number[], total: number): number[] {
  const bits: number[] = [];
  const poner = (valor: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >> i) & 1);
  };
  poner(0b0100, 4); // modo byte
  poner(bytes.length, 8); // la cuenta ocupa 8 bits hasta la versión 9
  for (const b of bytes) poner(b, 8);
  poner(0, Math.min(4, total * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let relleno = 0xec; bits.length < total * 8; relleno ^= 0xec ^ 0x11) poner(relleno, 8);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8).join(''), 2));
  return out;
}

// Datos de todos los bloques y luego sus códigos de corrección, intercalados byte a byte
function intercalar(datos: number[], v: Version): number[] {
  const bloques: number[][] = [];
  let pos = 0;
  for (const n of v.bloques) {
    bloques.push(datos.slice(pos, pos + n));
    pos += n;
  }
  const correccion = bloques.map((b) => restoReedSolomon(b, v.ec));
  const out: number[] = [];
  for (let i = 0; i < Math.max(...v.bloques); i++) for (const b of bloques) if (i < b.length) out.push(b[i]);
  for (let i = 0; i < v.ec; i++) for (const c of correccion) out.push(c[i]);
  return out;
}

// ---------- Matriz ----------

const bit = (valor: number, i: number) => ((valor >>> i) & 1) !== 0;

const MASCARAS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function construir(version: number, v: Version, palabras: number[]): boolean[][] {
  const n = 17 + 4 * version;
  const m: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const fija: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false)); // módulos que no son datos
  const poner = (r: number, c: number, oscuro: boolean) => {
    m[r][c] = oscuro;
    fija[r][c] = true;
  };

  // Localizadores con su separador
  for (const [r0, c0] of [
    [0, 0],
    [0, n - 7],
    [n - 7, 0],
  ]) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = r0 + dr;
        const c = c0 + dc;
        if (r < 0 || c < 0 || r >= n || c >= n) continue;
        const dentro = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
        poner(r, c, dentro && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)));
      }
    }
  }
  // Líneas de sincronización
  for (let i = 8; i < n - 8; i++) {
    poner(6, i, i % 2 === 0);
    poner(i, 6, i % 2 === 0);
  }
  // Patrones de alineación (todos menos los que chocan con los localizadores)
  const al = v.alineacion;
  for (const r0 of al) {
    for (const c0 of al) {
      if ((r0 === 6 && c0 === 6) || (r0 === 6 && c0 === al[al.length - 1]) || (r0 === al[al.length - 1] && c0 === 6)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) poner(r0 + dr, c0 + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  // Información de versión (desde la 7)
  if (version >= 7) {
    let resto = version;
    for (let i = 0; i < 12; i++) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bits = (version << 12) | resto;
    for (let i = 0; i < 18; i++) {
      const a = n - 11 + (i % 3);
      const b = Math.floor(i / 3);
      poner(b, a, bit(bits, i));
      poner(a, b, bit(bits, i));
    }
  }
  // Se reserva el sitio de la información de formato (el valor real se escribe al elegir la máscara)
  for (const [r, c, oscuro] of celdasFormato(n, 0)) poner(r, c, oscuro);

  // Datos en zigzag, de abajo arriba y de dos en dos columnas
  const total = palabras.length * 8;
  let k = 0;
  for (let derecha = n - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5; // la columna 6 es la de sincronización
    const hacia = ((derecha + 1) & 2) === 0 ? -1 : 1; // sube o baja según el par de columnas
    for (let i = 0; i < n; i++) {
      const r = hacia === -1 ? n - 1 - i : i;
      for (let d = 0; d < 2; d++) {
        const c = derecha - d;
        if (fija[r][c]) continue;
        m[r][c] = k < total && bit(palabras[k >> 3], 7 - (k & 7));
        k++;
      }
    }
  }
  return enmascarar(m, fija);
}

// Información de formato (nivel M + máscara) con corrección BCH, en sus dos copias
function celdasFormato(n: number, mascara: number): [number, number, boolean][] {
  const datos = (NIVEL_M << 3) | mascara;
  let resto = datos;
  for (let i = 0; i < 10; i++) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
  const bits = ((datos << 10) | resto) ^ 0x5412;
  const celdas: [number, number, boolean][] = [];
  for (let i = 0; i <= 5; i++) celdas.push([i, 8, bit(bits, i)]);
  celdas.push([7, 8, bit(bits, 6)], [8, 8, bit(bits, 7)], [8, 7, bit(bits, 8)]);
  for (let i = 9; i < 15; i++) celdas.push([8, 14 - i, bit(bits, i)]);
  for (let i = 0; i < 8; i++) celdas.push([8, n - 1 - i, bit(bits, i)]);
  for (let i = 8; i < 15; i++) celdas.push([n - 15 + i, 8, bit(bits, i)]);
  celdas.push([n - 8, 8, true]); // módulo oscuro fijo
  return celdas;
}

// Prueba las 8 máscaras y se queda con la de menor penalización
function enmascarar(base: boolean[][], fija: boolean[][]): boolean[][] {
  const n = base.length;
  let mejor: boolean[][] = base;
  let mejorPuntos = Infinity;
  for (let mascara = 0; mascara < 8; mascara++) {
    const m = base.map((fila) => fila.slice());
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fija[r][c] && MASCARAS[mascara](r, c)) m[r][c] = !m[r][c];
    for (const [r, c, oscuro] of celdasFormato(n, mascara)) m[r][c] = oscuro;
    const puntos = penalizacion(m);
    if (puntos < mejorPuntos) {
      mejorPuntos = puntos;
      mejor = m;
    }
  }
  return mejor;
}

function penalizacion(m: boolean[][]): number {
  const n = m.length;
  let puntos = 0;
  // Regla 1: tiras de 5 o más módulos iguales (filas y columnas)
  for (let a = 0; a < n; a++) {
    for (const horizontal of [true, false]) {
      let racha = 1;
      for (let b = 1; b <= n; b++) {
        const igual = b < n && (horizontal ? m[a][b] === m[a][b - 1] : m[b][a] === m[b - 1][a]);
        if (igual) racha++;
        else {
          if (racha >= 5) puntos += 3 + (racha - 5);
          racha = 1;
        }
      }
    }
  }
  // Regla 2: bloques de 2×2 del mismo color
  for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c] && m[r][c] === m[r + 1][c + 1]) puntos += 3;
  // Regla 3: patrón 1:1:3:1:1 con cuatro módulos claros a un lado
  const patron = /00001011101|10111010000/g;
  for (let a = 0; a < n; a++) {
    const fila = m[a].map((x) => (x ? '1' : '0')).join('');
    const col = m.map((f) => (f[a] ? '1' : '0')).join('');
    puntos += 40 * ((fila.match(patron)?.length ?? 0) + (col.match(patron)?.length ?? 0));
  }
  // Regla 4: equilibrio entre oscuros y claros
  const oscuros = m.reduce((s, f) => s + f.filter(Boolean).length, 0);
  puntos += 10 * Math.floor(Math.abs((oscuros * 100) / (n * n) - 50) / 5);
  return puntos;
}

// Matriz del QR (true = módulo oscuro), o null si el texto no cabe en la versión 7
export function qrMatriz(texto: string): boolean[][] | null {
  const bytes = Array.from(new TextEncoder().encode(texto));
  for (let version = 1; version <= 7; version++) {
    const v = VERSIONES[version];
    if (bytes.length > capacidad(v) - 2) continue;
    return construir(version, v, intercalar(palabrasDeDatos(bytes, capacidad(v)), v));
  }
  return null;
}
