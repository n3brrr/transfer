const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const LENGTH = 8

export function newToken(): string {
  const bytes = new Uint8Array(LENGTH)
  let out = ''
  // Se descartan los bytes que sesgarían el reparto sobre el alfabeto
  const limit = 256 - (256 % ALPHABET.length)
  while (out.length < LENGTH) {
    crypto.getRandomValues(bytes)
    for (const b of bytes) {
      if (b < limit && out.length < LENGTH) out += ALPHABET[b % ALPHABET.length]
    }
  }
  return out
}

// Id aleatorio de 16 bytes en hex (crypto.randomUUID no existe fuera de HTTPS)
export function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function normalizeToken(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase()
}

// Deja solo los caracteres que puede tener un código (mayúsculas del alfabeto, sin 0/O/1/I/L) y como mucho 8.
// Ignora espacios y guiones, así que "k7m2-xq9p" y "K7M2XQ9P" dan lo mismo.
export function sanitizeToken(input: string): string {
  let out = ''
  for (const ch of normalizeToken(input)) {
    if (ALPHABET.includes(ch)) out += ch
    if (out.length === LENGTH) break
  }
  return out
}

// Un código válido tiene exactamente 8 caracteres del alfabeto
export function isValidToken(token: string): boolean {
  return (
    token.length === LENGTH && [...token].every((ch) => ALPHABET.includes(ch))
  )
}

export function formatToken(token: string): string {
  return `${token.slice(0, 4)}-${token.slice(4)}`
}
