import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dart from 'highlight.js/lib/languages/dart'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import lua from 'highlight.js/lib/languages/lua'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import r from 'highlight.js/lib/languages/r'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// Este archivo arrastra highlight.js: solo lo carga la pestaña Texto (lazy). La lista de formatos está en formatos.ts.
const registrados = {
  bash,
  c,
  cpp,
  csharp,
  css,
  dart,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  lua,
  markdown,
  php,
  powershell,
  python,
  r,
  ruby,
  rust,
  sql,
  swift,
  typescript,
  xml,
  yaml,
}
for (const [nombre, lenguaje] of Object.entries(registrados))
  hljs.registerLanguage(nombre, lenguaje)

// Los que highlight.js distingue bien por sus palabras clave. YAML, INI, Diff, Dockerfile y PowerShell
// se reconocen por pistas (abajo); R y Lua se parecen demasiado a texto normal y solo se eligen a mano.
const AUTO = [
  'markdown',
  'json',
  'javascript',
  'typescript',
  'python',
  'xml',
  'css',
  'sql',
  'bash',
  'java',
  'csharp',
  'cpp',
  'c',
  'go',
  'rust',
  'php',
  'kotlin',
  'swift',
  'ruby',
]
const MAX_DETECCION = 5000 // caracteres que se miran para adivinar el formato
const RELEVANCIA_MINIMA = 4 // por debajo, la detección no es fiable y se deja "Texto"

// Formatos con una forma muy reconocible, sin pasar por el adivinador de highlight.js
function porPistas(t: string): string | null {
  const lineas = t.split('\n').map((l) => l.replace(/\r$/, ''))
  const utiles = lineas.filter((l) => l.trim() && !/^\s*#/.test(l))

  if (
    /^diff --git /m.test(t) ||
    /^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m.test(t) ||
    /^--- .+\n\+\+\+ /m.test(t)
  )
    return 'diff'

  if (
    /^FROM\s+\S+/.test(utiles[0] ?? '') &&
    utiles.some((l) =>
      /^(RUN|COPY|ADD|CMD|ENTRYPOINT|WORKDIR|ENV|EXPOSE|ARG)\s/.test(l),
    )
  )
    return 'dockerfile'

  if (
    /^\s*\[[A-Za-z_][\w.\- "]*\]\s*$/m.test(t) &&
    /^\s*[\w.-]+\s*=\s*\S/m.test(t) &&
    !/[{};]\s*$/m.test(t)
  )
    return 'ini'

  if (
    /\b(Get|Set|New|Remove|Add|Write|Invoke|Import|Export|Start|Stop|Test|Select|Where|ForEach)-[A-Z][A-Za-z]+\b/.test(
      t,
    ) &&
    (/\$\w+/.test(t) || / -[A-Z][A-Za-z]+\b/.test(t))
  )
    return 'powershell'

  // Se adivinan con highlightAuto de forma poco fiable (Dart sale en texto normal) o se confunden con TS/JS
  if (/System\.out\.print|public\s+static\s+void\s+main\s*\(\s*String/.test(t))
    return 'java'
  if (
    /^\s*import\s+'package:|\bvoid\s+main\s*\(\s*\)\s*(async\s*)?\{|\bStatel(ess|ful)Widget\b/m.test(
      t,
    )
  )
    return 'dart'

  // YAML: claves con valores o bloques anidados. Una nota suelta tipo "Hora: 10:00" no cuenta.
  const clave = /^\s*(-\s+)?[\w."'/-][\w."'/ -]*:(\s+\S.*|\s*)$/
  const elemento = /^\s*-\s+\S/
  const claves = utiles.filter((l) => clave.test(l)).length
  const anidado =
    utiles.some((l) => /^\s+\S/.test(l)) && utiles.some((l) => /:\s*$/.test(l))
  if (
    utiles.length >= 3 &&
    claves >= 2 &&
    anidado &&
    utiles.every((l) => clave.test(l) || elemento.test(l)) &&
    !utiles.some((l) => /[{};]\s*$/.test(l))
  )
    return 'yaml'
  if (/^---\s*\n/.test(t) && claves >= 1) return 'yaml'

  return null
}

export function detectar(texto: string): string {
  const t = texto.trim()
  if (/^[[{]/.test(t) && t.length < 500_000) {
    try {
      if (typeof JSON.parse(t) === 'object') return 'json'
    } catch {
      // no es JSON válido: se sigue con highlight.js
    }
  }
  const pista = porPistas(t)
  if (pista) return pista

  const r = hljs.highlightAuto(t.slice(0, MAX_DETECCION), AUTO)
  let lenguaje = r.language
  // En trozos pequeños CSS se confunde con JS/TS por las llaves: si van casi empatados, gana el segundo
  const segundo = r.secondBest
  if (
    lenguaje === 'css' &&
    segundo?.language &&
    ['javascript', 'typescript'].includes(segundo.language) &&
    segundo.relevance >= r.relevance - 2
  ) {
    lenguaje = segundo.language
  }
  // C y C++ se parecen: con cabeceras de C y sin nada propio de C++, es C
  if (
    lenguaje === 'cpp' &&
    /#include\s*<\w+\.h>/.test(t) &&
    !/std::|using\s+namespace|\bclass\b|template\s*</.test(t)
  )
    lenguaje = 'c'
  return lenguaje && r.relevance >= RELEVANCIA_MINIMA ? lenguaje : 'text'
}

// HTML ya escapado con el contenido resaltado, o null si ese formato no se resalta (texto, demasiado largo o desconocido)
export function resaltar(
  contenido: string,
  formato: string,
  maximo: number,
): string | null {
  if (
    formato === 'text' ||
    contenido.length > maximo ||
    !hljs.getLanguage(formato)
  )
    return null
  try {
    return hljs.highlight(contenido, {
      language: formato,
      ignoreIllegals: true,
    }).value
  } catch {
    return null
  }
}
