// Chequeo de arquitectura sin dependencias. Lo ejecuta `pnpm lint` (y por tanto el CI).
// Reglas: docs/feature-map.md y docs/architecture.md. Si falla, mover el código; no desactivar la regla.
import fs from 'node:fs'
import path from 'node:path'

const RAIZ = process.cwd()
const RAICES = ['client/src', 'server', 'shared']
const LIMITE_LINEAS = 500
const GENERICOS = new Set([
  'utils',
  'helpers',
  'misc',
  'common',
  'temp',
  'new',
  'final',
  'old',
  'v2',
])

// Features de cliente y de qué otras features puede importar cada una.
const PERMITIDOS = {
  app: ['sala', 'archivos', 'texto', 'transferencia', 'portapapeles'],
  archivos: ['sala', 'transferencia', 'portapapeles'],
  texto: ['sala', 'transferencia', 'portapapeles'],
  sala: ['transferencia', 'portapapeles'],
  transferencia: [],
  portapapeles: [],
}

const errores = []
const avisos = []

function listar(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.posix.join(dir, d.name)
    if (d.isDirectory()) return listar(p)
    return /\.(ts|tsx)$/.test(d.name) ? [p] : []
  })
}

// Qué "feature" es un archivo: primer segmento tras client/src/, o servidor/shared.
function featureDe(archivo) {
  if (archivo.startsWith('client/src/')) return archivo.split('/')[2]
  if (archivo.startsWith('server/')) return 'server'
  if (archivo.startsWith('shared/')) return 'shared'
  return null
}

const RE_IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g

const archivos = RAICES.filter((r) =>
  fs.existsSync(path.join(RAIZ, r)),
).flatMap(listar)

for (const archivo of archivos) {
  const nombre = path.posix.basename(archivo).replace(/\.(tsx?)$/, '')
  const trozos = nombre.toLowerCase().split(/[-.]/)
  if (
    GENERICOS.has(nombre.toLowerCase()) ||
    trozos.some((t) => GENERICOS.has(t))
  ) {
    errores.push(
      `${archivo}: nombre genérico («${nombre}»). Usar un nombre que diga qué contiene.`,
    )
  }

  const lineas = fs
    .readFileSync(path.join(RAIZ, archivo), 'utf8')
    .split('\n').length
  if (lineas > LIMITE_LINEAS)
    avisos.push(
      `${archivo}: ${lineas} líneas (más de ${LIMITE_LINEAS}); pendiente de dividir`,
    )

  const origen = featureDe(archivo)
  const texto = fs.readFileSync(path.join(RAIZ, archivo), 'utf8')
  for (const [, spec] of texto.matchAll(RE_IMPORT)) {
    const destino = path.posix.normalize(
      path.posix.join(path.posix.dirname(archivo), spec),
    )
    if (destino.startsWith('..')) {
      errores.push(
        `${archivo}: el import sale de la raíz del proyecto (${spec}).`,
      )
      continue
    }
    const destinoFeature = featureDe(destino)
    if (!destinoFeature || destinoFeature === origen) continue

    // Cliente, servidor y shared no se importan entre sí (salvo shared, que es común).
    if (origen === 'shared' && destinoFeature !== 'shared') {
      errores.push(
        `${archivo}: shared no puede importar de ${destinoFeature} (${spec}).`,
      )
      continue
    }
    if (destinoFeature === 'shared') continue
    if ((origen === 'server') !== (destinoFeature === 'server')) {
      errores.push(
        `${archivo}: cliente y servidor no se importan entre sí (${spec}).`,
      )
      continue
    }
    if (origen === 'server') continue // server/sala y server/index.ts pueden verse entre sí.
    if (origen === 'shared') continue

    const permitidos = PERMITIDOS[origen]
    if (!permitidos) {
      errores.push(
        `${archivo}: feature «${origen}» no está en el mapa de dependencias (scripts/check-arquitectura.mjs).`,
      )
    } else if (!permitidos.includes(destinoFeature)) {
      errores.push(
        `${archivo}: «${origen}» no puede importar de «${destinoFeature}» (${spec}). Ver docs/feature-map.md.`,
      )
    }
  }
}

for (const a of avisos) console.log(`aviso: ${a}`)
if (errores.length) {
  for (const e of errores) console.error(`error: ${e}`)
  console.error(`\nChequeo de arquitectura: ${errores.length} error(es).`)
  process.exit(1)
}
console.log(
  `Chequeo de arquitectura: OK (${archivos.length} archivos, ${avisos.length} aviso(s)).`,
)
