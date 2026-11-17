import { Fragment, useRef, useState } from 'react'
import { isValidToken, sanitizeToken } from '../../../shared/token'

const ERRORES: Record<string, string> = {
  not_found: 'Código no válido',
  expired: 'El código ha caducado',
  full: 'La sala ya está completa',
  rate_limited: 'Demasiados intentos, espera un minuto',
  rejected: 'El otro dispositivo rechazó la conexión',
  no_answer: 'El otro dispositivo no respondió a tiempo',
  sin_conexion: 'No se puede conectar con el servidor',
}

// Al crear, el límite es de salas activas, no de intentos
const ERRORES_CREAR: Record<string, string> = {
  rate_limited: 'Hay demasiadas salas activas, inténtalo en un momento',
}

type Accion = 'crear' | 'unirse'

type Props = {
  aviso: string | null
  esperando: boolean // ya pedí unirme y espero a que el otro dispositivo me acepte
  onCancelarEspera(): void
  // Devuelven un código de error, o null si todo ha ido bien
  onCrear(): Promise<string | null>
  onUnirse(token: string): Promise<string | null>
}

const CASILLAS = 8

type CodigoProps = {
  valor: string
  onCambio(valor: string): void
  invalido: boolean
  describedBy?: string
}

// Código en 8 casillas (4 - 4). Hay UN solo campo de texto real, invisible y encima de las casillas:
// así funcionan el pegado, el autocompletado, el teclado del móvil y los lectores de pantalla.
// Todo lo que entra pasa por sanitizeToken: solo quedan caracteres válidos y como mucho 8.
function CodigoInput({ valor, onCambio, invalido, describedBy }: CodigoProps) {
  const [enfocado, setEnfocado] = useState(false)
  const activa = Math.min(valor.length, CASILLAS - 1)

  return (
    <div className="relative">
      <div
        className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto_repeat(4,minmax(0,1fr))] items-center gap-1.5"
        aria-hidden="true"
      >
        {Array.from({ length: CASILLAS }, (_, i) => {
          const marcada = enfocado && i === activa
          const borde = invalido
            ? 'border-acento-texto'
            : marcada
              ? 'border-acento-texto ring-2 ring-acento/30'
              : valor[i]
                ? 'border-tinta/50'
                : 'border-borde'
          return (
            <Fragment key={i}>
              {i === 4 && <span className="px-0.5 text-xl text-suave">-</span>}
              <span
                className={`flex h-12 items-center justify-center rounded-xl border-2 bg-white/60 font-mono text-[1.35rem] font-semibold transition ${borde}`}
              >
                {valor[i] ??
                  (marcada ? (
                    <span className="h-6 w-0.5 animate-pulse bg-acento-texto" />
                  ) : (
                    ''
                  ))}
              </span>
            </Fragment>
          )
        })}
      </div>
      <input
        id="codigo"
        className="absolute inset-0 h-full w-full cursor-text text-base opacity-0 [caret-color:transparent]"
        aria-label="Código de la sala, 8 caracteres"
        aria-invalid={invalido ? true : undefined}
        aria-describedby={describedBy}
        type="text"
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="go"
        value={valor}
        onChange={(e) => onCambio(sanitizeToken(e.target.value))}
        // Pegar siempre sustituye el código entero (aunque ya hubiera algo escrito)
        onPaste={(e) => {
          e.preventDefault()
          const pegado = sanitizeToken(e.clipboardData.getData('text'))
          if (pegado) onCambio(pegado)
        }}
        // El cursor siempre va al final: se borra de atrás hacia delante
        onSelect={(e) => {
          const el = e.currentTarget
          if (
            el.selectionStart === el.selectionEnd &&
            el.selectionStart !== el.value.length
          )
            el.setSelectionRange(el.value.length, el.value.length)
        }}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
      />
    </div>
  )
}

function Logo() {
  return (
    <div
      className="flex h-14 w-14 items-center justify-center rounded-2xl bg-acento text-white"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-8 w-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 8h15m-4-4 4 4-4 4" />
        <path d="M20 16H5m4-4-4 4 4 4" />
      </svg>
    </div>
  )
}

export default function Inicio({
  aviso,
  esperando,
  onCancelarEspera,
  onCrear,
  onUnirse,
}: Props) {
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<{ accion: Accion; texto: string } | null>(
    null,
  )
  const [ocupado, setOcupado] = useState<Accion | null>(null)

  const enCurso = useRef(false) // evita el doble clic antes de que se refresque el estado

  async function lanzar(accion: Accion, tarea: () => Promise<string | null>) {
    if (enCurso.current) return
    enCurso.current = true
    setOcupado(accion)
    setError(null)
    try {
      const fallo = await tarea()
      if (fallo && fallo !== 'cancelado') {
        const texto =
          (accion === 'crear' && ERRORES_CREAR[fallo]) ||
          ERRORES[fallo] ||
          'Algo ha fallado'
        setError({ accion, texto })
      }
    } catch {
      setError({ accion, texto: 'Algo ha fallado' })
    } finally {
      // Los botones nunca se quedan bloqueados
      enCurso.current = false
      setOcupado(null)
    }
  }

  const listo = isValidToken(codigo)
  const errorCrear = error?.accion === 'crear' ? error.texto : null
  const errorUnirse = error?.accion === 'unirse' ? error.texto : null

  return (
    <main className="pantalla text-center">
      <div className="flex flex-col items-center gap-3">
        <Logo />
        <h1 className="text-3xl font-bold tracking-tight">Transferir</h1>
        <p className="max-w-64 text-suave">
          Pasa archivos y textos entre tus dispositivos
        </p>
      </div>

      <div aria-live="polite" className="w-full max-w-sm">
        {aviso && (
          <p className="rounded-xl border border-borde bg-superficie px-4 py-3 text-sm">
            {aviso}
          </p>
        )}
      </div>

      <div className="tarjeta flex flex-col gap-4">
        <div className="flex flex-col">
          <button
            className="btn btn-primario w-full text-lg"
            disabled={ocupado !== null}
            onClick={() => lanzar('crear', onCrear)}
          >
            {ocupado === 'crear' ? 'Creando…' : 'Crear sala'}
          </button>
          <div aria-live="polite">
            {errorCrear && (
              <p className="mt-2 text-sm text-acento-texto">{errorCrear}</p>
            )}
          </div>
        </div>

        <div
          className="flex items-center gap-3 text-sm text-suave"
          aria-hidden="true"
        >
          <span className="h-px flex-1 bg-borde" />
          <span>o</span>
          <span className="h-px flex-1 bg-borde" />
        </div>

        <form
          className="flex flex-col gap-2 text-left"
          onSubmit={(e) => {
            e.preventDefault()
            if (listo && ocupado === null)
              lanzar('unirse', () => onUnirse(codigo))
          }}
        >
          <label htmlFor="codigo" className="text-sm font-medium">
            ¿Tienes un código?
          </label>
          <CodigoInput
            valor={codigo}
            invalido={!!errorUnirse}
            describedBy={errorUnirse ? 'error-codigo' : undefined}
            onCambio={(v) => {
              setCodigo(v)
              if (error?.accion === 'unirse') setError(null)
            }}
          />
          <button
            className="btn btn-secundario mt-1 min-h-12 w-full"
            disabled={!listo || ocupado !== null}
          >
            {ocupado === 'unirse'
              ? esperando
                ? 'Esperando…'
                : 'Uniendo…'
              : 'Unirme'}
          </button>
          {esperando && (
            <div
              role="status"
              className="flex flex-col gap-2 rounded-xl bg-superficie p-3 text-center text-sm"
            >
              <p>Esperando a que el otro dispositivo te acepte…</p>
              <button
                type="button"
                className="btn btn-secundario min-h-11 w-full"
                onClick={onCancelarEspera}
              >
                Cancelar
              </button>
            </div>
          )}
          <div aria-live="polite">
            {errorUnirse && (
              <p id="error-codigo" className="text-sm text-acento-texto">
                {errorUnirse}
              </p>
            )}
          </div>
        </form>
      </div>
    </main>
  )
}
