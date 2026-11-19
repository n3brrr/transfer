import { useEffect, useRef, useState } from 'react'
import { formatToken } from '../../../shared/token/token'
import { copiarTexto } from '../portapapeles/portapapeles'
import QrCodigo from './QrCodigo'

const EXPIRA_MS = 5 * 60_000

type Props = {
  token: string
  solicitud: boolean // un dispositivo pide unirse y hay que aceptarlo o rechazarlo
  onAceptar(): void
  onRechazar(): void
  onCancelar(): void
  onCrearOtro(): void
}

type ConectandoProps = {
  estado: 'conectando' | 'reconectando' | 'fallo'
  onReintentar(): void
  onCancelar(): void
}

function Puntos() {
  return (
    <span className="puntos" aria-hidden="true">
      <span>.</span>
      <span>.</span>
      <span>.</span>
    </span>
  )
}

// Pantalla entre el emparejamiento y la sala (la conexión directa se está abriendo)
export function Conectando({
  estado,
  onReintentar,
  onCancelar,
}: ConectandoProps) {
  return (
    <main className="pantalla text-center">
      <div className="tarjeta flex flex-col items-center gap-4">
        {estado === 'fallo' ? (
          <>
            <p role="alert" className="text-lg">
              No se pudo conectar con el otro dispositivo. Comprueba que están
              en la misma red.
            </p>
            <div className="flex w-full flex-col gap-2">
              <button
                className="btn btn-primario w-full"
                onClick={onReintentar}
              >
                Reintentar
              </button>
              <button
                className="btn btn-secundario w-full"
                onClick={onCancelar}
              >
                Volver
              </button>
            </div>
          </>
        ) : (
          <>
            <p role="status" className="text-xl font-semibold">
              {estado === 'conectando' ? 'Conectando' : 'Reconectando'}
              <Puntos />
              <span className="sr-only">…</span>
            </p>
            <button className="btn btn-secundario w-full" onClick={onCancelar}>
              Cancelar
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default function SalaCreada({
  token,
  solicitud,
  onAceptar,
  onRechazar,
  onCancelar,
  onCrearOtro,
}: Props) {
  const [caducado, setCaducado] = useState(false)
  const [copiado, setCopiado] = useState<'si' | 'no' | null>(null)
  const aviso = useRef<number | undefined>(undefined)

  useEffect(() => {
    setCaducado(false)
    const timer = setTimeout(() => setCaducado(true), EXPIRA_MS)
    return () => clearTimeout(timer)
  }, [token])

  useEffect(() => () => clearTimeout(aviso.current), [])

  async function copiar() {
    setCopiado((await copiarTexto(formatToken(token))) ? 'si' : 'no')
    clearTimeout(aviso.current)
    aviso.current = window.setTimeout(() => setCopiado(null), 2500)
  }

  return (
    <main className="pantalla text-center">
      <div className="tarjeta flex flex-col items-center gap-4">
        {solicitud && (
          <div
            role="alert"
            className="w-full rounded-xl border-2 border-acento-texto bg-superficie p-3 text-left"
          >
            <p className="font-semibold">Un dispositivo quiere unirse</p>
            <p className="mb-3 text-sm text-suave">
              Acepta solo si lo estás uniendo tú ahora mismo.
            </p>
            <div className="flex gap-2">
              <button className="btn btn-primario flex-1" onClick={onAceptar}>
                Aceptar
              </button>
              <button
                className="btn btn-secundario flex-1"
                onClick={onRechazar}
              >
                Rechazar
              </button>
            </div>
          </div>
        )}
        {caducado ? (
          <>
            <p role="status" className="text-lg">
              El código ha caducado
            </p>
            <button className="btn btn-primario w-full" onClick={onCrearOtro}>
              Crear otro
            </button>
          </>
        ) : (
          <>
            <p className="text-suave">Tu código</p>
            <p
              className="max-w-full rounded-xl bg-white/60 px-3 py-2 font-mono font-bold tracking-[0.08em] whitespace-nowrap select-all"
              style={{ fontSize: 'clamp(1.75rem, 10.5vw, 2.75rem)' }}
            >
              {formatToken(token)}
            </p>
            <p className="text-sm text-suave">
              Escríbelo en el otro dispositivo o escanea el QR
            </p>
            {/* El código va en la parte tras «#»: el navegador no la envía al servidor */}
            <QrCodigo
              texto={`${location.origin}/#${token}`}
              etiqueta="Código QR para unirse a la sala"
            />
            <button className="btn btn-primario w-full" onClick={copiar}>
              {copiado === 'si' ? 'Copiado' : 'Copiar código'}
            </button>
            <p
              role="status"
              className="flex items-center gap-1 text-sm text-suave"
            >
              Esperando al otro dispositivo
              <Puntos />
            </p>
            <p role="status" className="min-h-5 text-sm text-acento-texto">
              {copiado === 'si' && 'Código copiado'}
              {copiado === 'no' && 'No se pudo copiar. Selecciónalo a mano.'}
            </p>
          </>
        )}
        <button className="btn btn-secundario w-full" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </main>
  )
}
