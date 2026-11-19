import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ClipboardPaste, Copy, Eraser, Trash2 } from 'lucide-react'
import { FORMATOS, nombreFormato } from '../files/formatos'
import { detectar, resaltar } from '../files/resaltado'
import type { Sala, TextItem } from '../state/sala'
import { formatSize } from '../files/transfer'
import { copiarTexto } from '../ui/portapapeles'

const MAX_BYTES = 1024 * 1024
const AVISO_BYTES = 800 * 1024 // a partir de aquí se avisa de que se acerca el límite
const MAX_RESALTADO = 100_000 // más de esto se muestra sin resaltar
const LINEAS_PLEGADO = 12
const CARACTERES_PLEGADO = 1000 // texto corrido sin saltos de línea también se pliega

const foco =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acento'
const boton = `h-11 rounded-lg px-4 text-sm font-medium ${foco}`
const secundario = `${boton} border-2 border-acento text-tinta`
const herramienta = `${boton} inline-flex items-center gap-1.5 border-2 border-borde text-tinta transition hover:border-acento hover:bg-superficie active:scale-95`
const campo = `w-full rounded-lg border-2 border-borde bg-superficie px-3 text-base text-tinta ${foco}`

type FragmentoProps = {
  item: TextItem
  origen: string // de qué dispositivo viene (nombre del otro, o «Este dispositivo»)
  editando: boolean
  onEditar(): void
  onQuitar(): void
}

function Fragmento({
  item,
  origen,
  editando,
  onEditar,
  onQuitar,
}: FragmentoProps) {
  const [copia, setCopia] = useState<'ok' | 'error' | null>(null)
  const [abierto, setAbierto] = useState(false)
  const temporizador = useRef(0)
  useEffect(() => () => clearTimeout(temporizador.current), [])

  const esTexto = item.format === 'text'
  // highlight.js escapa el HTML del contenido: es la única salida que se inyecta
  const html = useMemo(
    () => resaltar(item.content, item.format, MAX_RESALTADO),
    [item.content, item.format],
  )
  const lineas = useMemo(() => item.content.split('\n').length, [item.content])
  const largo =
    lineas > LINEAS_PLEGADO || item.content.length > CARACTERES_PLEGADO
  const plegado = largo && !abierto
  const nombre = nombreFormato(item.format)

  async function alCopiar() {
    const ok = await copiarTexto(item.content)
    setCopia(ok ? 'ok' : 'error')
    clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setCopia(null), 2000)
  }

  const bloque = esTexto
    ? 'border border-borde bg-crema text-sm text-tinta whitespace-pre-wrap break-words'
    : 'bg-tinta font-mono text-[13px] text-crema whitespace-pre'

  return (
    <li
      className={`entra min-w-0 rounded-xl bg-superficie p-3 ${editando ? 'ring-2 ring-acento' : ''}`}
    >
      <p className="text-sm opacity-75">
        {nombre} · {origen}
        {editando && ' · Editando'}
      </p>
      <div className="relative my-2">
        <pre
          tabIndex={0}
          role="region"
          aria-label={`Contenido del fragmento (${nombre})`}
          className={`rounded-lg p-3 leading-5 ${bloque} ${foco} ${plegado ? 'max-h-[16.5rem] overflow-x-auto overflow-y-hidden' : 'max-h-[70dvh] overflow-auto'}`}
        >
          {html === null ? (
            item.content
          ) : (
            <code dangerouslySetInnerHTML={{ __html: html }} />
          )}
        </pre>
        {plegado && (
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-lg bg-linear-to-t to-transparent ${esTexto ? 'from-crema' : 'from-tinta'}`}
          />
        )}
      </div>
      {largo && (
        <button
          className={`${secundario} mb-2 w-full`}
          aria-expanded={abierto}
          onClick={() => setAbierto(!abierto)}
        >
          {abierto
            ? 'Ver menos'
            : `Ver todo (${lineas} ${lineas === 1 ? 'línea' : 'líneas'})`}
        </button>
      )}
      <div className="flex gap-2">
        <button
          className={`${secundario} flex-1 sm:flex-none sm:px-6`}
          aria-label={`Copiar fragmento ${nombre}`}
          onClick={alCopiar}
        >
          {/* Las dos etiquetas ocupan el mismo sitio para que el botón no cambie de ancho */}
          <span className="grid">
            <span
              className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${copia === 'ok' ? 'invisible' : ''}`}
            >
              <Copy className="size-4" aria-hidden="true" />
              Copiar
            </span>
            <span
              className={`col-start-1 row-start-1 inline-flex items-center justify-center gap-1.5 ${copia === 'ok' ? 'hecho' : 'invisible'}`}
              aria-hidden="true"
            >
              <Check className="size-4 text-ok" strokeWidth={3} />
              Copiado
            </span>
          </span>
        </button>
        {item.mine && (
          <>
            <button
              className={`${secundario} flex-1 disabled:opacity-50 sm:flex-none sm:px-6`}
              aria-label={`Editar fragmento ${nombre}`}
              disabled={editando}
              onClick={onEditar}
            >
              Editar
            </button>
            <button
              className={`${secundario} flex flex-1 items-center justify-center transition active:scale-95 sm:flex-none sm:px-6`}
              aria-label={`Quitar fragmento ${nombre}`}
              title="Quitar fragmento"
              onClick={onQuitar}
            >
              <Trash2 className="size-5" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
      <p
        role="status"
        className={copia === 'error' ? 'mt-2 text-sm font-medium' : 'sr-only'}
      >
        {copia === 'ok'
          ? 'Copiado'
          : copia === 'error'
            ? 'No se pudo copiar. Selecciona el texto y cópialo a mano.'
            : ''}
      </p>
    </li>
  )
}

type Borrador = { contenido: string; formato: string; manual: boolean }

export default function Texto({ sala }: { sala: Sala }) {
  const [contenido, setContenido] = useState('')
  const [formato, setFormato] = useState('text')
  const [manual, setManual] = useState(false) // el usuario eligió el formato: no se toca solo
  const [detectado, setDetectado] = useState(false)
  const [editando, setEditando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const formulario = useRef<HTMLDivElement>(null)
  const borrador = useRef<Borrador | null>(null) // lo que había escrito antes de editar un fragmento
  const temporizador = useRef(0)

  const bytes = useMemo(() => new Blob([contenido]).size, [contenido])
  const demasiado = bytes > MAX_BYTES
  const cerca = bytes >= AVISO_BYTES && !demasiado
  const vacio = !contenido.trim()

  // La altura del área sigue al contenido (con tope en CSS); oculta mide 0 y se deja como está
  function ajustar() {
    const el = area.current
    if (!el || el.scrollHeight === 0) return
    const arriba = el.scrollTop
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + 4}px`
    el.scrollTop = arriba
  }
  useLayoutEffect(ajustar, [contenido])
  useEffect(() => {
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [])

  // Detección automática: sin prisa (300 ms tras la última pulsación) y solo si no se eligió a mano
  useEffect(() => {
    if (manual) return
    if (vacio) {
      setFormato('text')
      setDetectado(false)
      return
    }
    const t = window.setTimeout(() => {
      const f = detectar(contenido)
      setFormato(f)
      setDetectado(f !== 'text')
    }, 300)
    return () => clearTimeout(t)
  }, [contenido, manual, vacio])

  // Si el fragmento que se edita desaparece, se sale de la edición
  useEffect(() => {
    if (editando && !sala.texts.some((t) => t.id === editando)) restaurar()
  }, [sala.texts, editando])

  useEffect(() => () => clearTimeout(temporizador.current), [])

  function avisar(texto: string) {
    setAviso(texto)
    clearTimeout(temporizador.current)
    temporizador.current = window.setTimeout(() => setAviso(''), 2500)
  }

  // Vuelve al borrador anterior (o deja el formulario vacío)
  function restaurar() {
    const b = borrador.current ?? {
      contenido: '',
      formato: 'text',
      manual: false,
    }
    borrador.current = null
    setEditando(null)
    setContenido(b.contenido)
    setFormato(b.formato)
    setManual(b.manual)
    setDetectado(false)
  }

  function editar(item: TextItem) {
    if (editando === null)
      borrador.current = vacio ? null : { contenido, formato, manual }
    setEditando(item.id)
    setContenido(item.content)
    setFormato(item.format)
    setManual(true)
    setDetectado(false)
    formulario.current?.scrollIntoView({ block: 'start' })
    area.current?.focus({ preventScroll: true })
  }

  function quitar(id: string) {
    if (editando === id) restaurar()
    sala.removeText(id)
  }

  // "Pegar" solo existe donde el navegador deja leer el portapapeles (HTTPS)
  const puedePegar =
    typeof navigator !== 'undefined' && !!navigator.clipboard?.readText

  function limpiar() {
    setContenido('')
    if (!editando) {
      setManual(false)
      setFormato('text')
    }
    setDetectado(false)
    area.current?.focus()
  }

  async function pegar() {
    try {
      const texto = await navigator.clipboard.readText()
      if (!texto) return avisar('El portapapeles está vacío')
      const el = area.current
      const ini = el?.selectionStart ?? contenido.length
      const fin = el?.selectionEnd ?? ini
      setContenido(contenido.slice(0, ini) + texto + contenido.slice(fin))
      area.current?.focus()
    } catch {
      avisar('No se pudo leer el portapapeles')
    }
  }

  // Quita todos los fragmentos de este dispositivo (los del otro no se tocan)
  function vaciar() {
    if (
      !confirm(
        '¿Quitar todos tus textos de la lista? El otro dispositivo también dejará de verlos.',
      )
    )
      return
    if (editando && sala.texts.some((t) => t.id === editando && t.mine))
      restaurar()
    for (const t of sala.texts) if (t.mine) sala.removeText(t.id)
  }

  function anadir() {
    if (vacio || demasiado) return
    const f = manual ? formato : detectar(contenido) // por si se pulsa antes de que acabe la espera
    if (editando) sala.removeText(editando)
    sala.addText(f, contenido)
    avisar(editando ? 'Cambios guardados' : 'Añadido')
    restaurar()
  }

  return (
    <section>
      <div ref={formulario} className="mb-5 scroll-mt-3">
        {editando && (
          <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-superficie p-2 pl-3">
            <span className="text-sm font-medium">Editando un fragmento</span>
            <button className={secundario} onClick={restaurar}>
              Cancelar edición
            </button>
          </div>
        )}
        {(puedePegar || !vacio) && (
          <div className="mb-2 flex justify-end gap-2">
            {puedePegar && (
              <button
                type="button"
                className={herramienta}
                aria-label="Pegar desde el portapapeles"
                onClick={pegar}
              >
                <ClipboardPaste className="size-4" aria-hidden="true" />
                Pegar
              </button>
            )}
            {!vacio && (
              <button
                type="button"
                className={`${herramienta} hecho`}
                aria-label="Limpiar el texto"
                onClick={limpiar}
              >
                <Eraser className="size-4" aria-hidden="true" />
                Limpiar
              </button>
            )}
          </div>
        )}
        <textarea
          ref={area}
          aria-label="Texto para compartir"
          className={`${campo} mb-1 max-h-[45dvh] min-h-36 resize-none py-3 font-mono text-base leading-6`}
          placeholder="Pega o escribe aquí…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          value={contenido}
          onChange={(e) => setContenido(e.target.value)}
        />
        <div className="mb-3 flex flex-wrap items-start justify-between gap-x-3 text-sm">
          <p role="status" className="min-h-5 opacity-75">
            {aviso ||
              (detectado && !manual
                ? `Formato detectado automáticamente: ${nombreFormato(formato)}`
                : '')}
          </p>
          {!vacio && (
            <p className={demasiado || cerca ? 'font-medium' : 'opacity-75'}>
              {formatSize(bytes)} de 1 MB
            </p>
          )}
        </div>
        {demasiado && (
          <p
            role="alert"
            className="mb-3 rounded-lg border-2 border-acento bg-superficie p-3 text-sm font-medium"
          >
            Texto demasiado grande: el máximo es 1 MB. Divídelo en partes más
            pequeñas.
          </p>
        )}
        {cerca && (
          <p className="mb-3 rounded-lg border-2 border-borde bg-superficie p-3 text-sm">
            Te acercas al límite de 1 MB.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select
            aria-label="Formato"
            className={`${campo} h-12 sm:w-48`}
            value={formato}
            onChange={(e) => {
              setFormato(e.target.value)
              setManual(true)
              setDetectado(false)
            }}
          >
            {FORMATOS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nombre}
              </option>
            ))}
          </select>
          <button
            className={`h-12 rounded-lg bg-acento-texto px-4 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:ml-auto sm:px-10 ${foco}`}
            disabled={vacio || demasiado}
            onClick={anadir}
          >
            {editando ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>

      {sala.texts.length === 0 ? (
        <p className="text-center text-sm opacity-75">
          Aún no hay textos. Lo que añadas aquí lo verá el otro dispositivo.
        </p>
      ) : (
        <>
          {sala.texts.some((t) => t.mine) && (
            <div className="mb-3 flex justify-end">
              <button type="button" className={herramienta} onClick={vaciar}>
                <Trash2 className="size-4" aria-hidden="true" />
                Vaciar mis textos
              </button>
            </div>
          )}
          <ul className="flex flex-col gap-3">
            {sala.texts.map((t) => (
              <Fragmento
                key={t.id}
                item={t}
                origen={
                  t.mine
                    ? 'Este dispositivo'
                    : (sala.peerName ?? 'Otro dispositivo')
                }
                editando={editando === t.id}
                onEditar={() => editar(t)}
                onQuitar={() => quitar(t.id)}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
