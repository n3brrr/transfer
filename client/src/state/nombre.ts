import { isMobile } from '../files/transfer'
import { sanitizeDeviceName } from '../files/validar'

const KEY = 'transferir.nombre'

export const nombrePorDefecto = () => (isMobile() ? 'Móvil' : 'PC')

// El nombre se recuerda en este navegador (localStorage); sin almacenamiento, se usa el de por defecto
export function cargarNombre(): string {
  try {
    return sanitizeDeviceName(localStorage.getItem(KEY)) || nombrePorDefecto()
  } catch {
    return nombrePorDefecto()
  }
}

export function guardarNombre(nombre: string): void {
  try {
    localStorage.setItem(KEY, nombre)
  } catch {
    // sin almacenamiento: vale solo para esta sesión
  }
}
