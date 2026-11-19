import { FORMATO_IDS } from './formatos'
import { MAX_MINIATURA } from './miniatura'

// Todo lo que llega del otro dispositivo es entrada no fiable: estas funciones lo limpian antes de usarlo.

export const DEFAULT_NAME = 'archivo'
const MAX_NAME = 200
const MAX_MIME = 100
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i
// Caracteres de control, marcas de dirección (RTL override: foto + U+202E + gpj.exe) y espacios invisibles
const invisible = (c: number) =>
  c <= 0x1f ||
  (c >= 0x7f && c <= 0x9f) ||
  c === 0xad ||
  (c >= 0x200b && c <= 0x200f) ||
  (c >= 0x2028 && c <= 0x202e) ||
  (c >= 0x2060 && c <= 0x206f) ||
  c === 0xfeff ||
  (c >= 0xfff9 && c <= 0xfffb)

// Nombre seguro para guardar: sin rutas, sin caracteres prohibidos en Windows, sin nombres reservados
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_NAME
  let name = Array.from(raw.slice(0, 1000)) // acota el trabajo antes de limpiar
    .filter((ch) => !invisible(ch.codePointAt(0)!))
    .join('')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/^\s+/, '')
    .replace(/[. ]+$/, '') // Windows no admite puntos ni espacios al final
  if (/^\.+$/.test(name)) name = ''
  if (WINDOWS_RESERVED.test(name.split('.')[0].trim())) name = `_${name}`
  if (name.length > MAX_NAME) {
    const ext = /\.[^.]{1,20}$/.exec(name)?.[0] ?? ''
    name =
      name.slice(0, MAX_NAME - ext.length).replace(/[\ud800-\udbff]$/, '') + ext
  }
  return name || DEFAULT_NAME
}

// Nombre de dispositivo del otro lado: corto, sin caracteres invisibles ni saltos de línea. Vacío si no queda nada.
const MAX_DEVICE_NAME = 30
export function sanitizeDeviceName(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return Array.from(raw.slice(0, 200))
    .filter((ch) => !invisible(ch.codePointAt(0)!))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .split('')
    .slice(0, MAX_DEVICE_NAME)
    .join('')
    .replace(/[\ud800-\udbff]$/, '')
    .trim()
}

// Miniatura que manda el otro dispositivo: solo se admite una data URL JPEG con base64 estricto y tamaño acotado
const MINIATURA = /^data:image\/jpeg;base64,[A-Za-z0-9+/]{16,}={0,2}$/
export function sanitizeThumb(raw: unknown): string | undefined {
  return typeof raw === 'string' &&
    raw.length <= MAX_MINIATURA &&
    MINIATURA.test(raw)
    ? raw
    : undefined
}

// Tipos que un navegador ejecutaría si llegara a abrir el archivo como página
const ACTIVE_MIME =
  /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml|text\/javascript|application\/javascript|text\/css)$/i

export function sanitizeMime(raw: unknown): string {
  const OTHER = 'application/octet-stream'
  if (typeof raw !== 'string' || raw.length > MAX_MIME) return OTHER
  const mime = raw.trim().toLowerCase()
  if (
    !/^[a-z0-9][\w.+-]*\/[a-z0-9][\w.+-]*$/.test(mime) ||
    ACTIVE_MIME.test(mime)
  )
    return OTHER
  return mime
}

const DANGEROUS = new Set(
  (
    'exe bat cmd com scr pif msi msp lnk js jse vbs vbe wsf wsh hta cpl reg dll ps1 psm1 psd1 sh jar apk app ' +
    'docm xlsm pptm dotm xltm gadget inf scf url dmg pkg deb rpm'
  ).split(' '),
)

// Extensión de un tipo de archivo que ejecuta código al abrirlo (se avisa, no se bloquea)
export function isDangerousName(name: string): boolean {
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase()
  return ext !== undefined && DANGEROUS.has(ext)
}

// Mismos formatos que el desplegable de Texto (files/formatos.ts)
const TEXT_FORMATS = FORMATO_IDS

export function sanitizeFormat(raw: unknown): string {
  return typeof raw === 'string' && TEXT_FORMATS.has(raw) ? raw : 'text'
}
