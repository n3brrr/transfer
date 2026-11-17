// Formatos del desplegable. `ini` también resalta TOML y `xml` también HTML.
export const FORMATOS = [
  { id: 'text', nombre: 'Texto' },
  { id: 'markdown', nombre: 'Markdown' },
  { id: 'json', nombre: 'JSON' },
  { id: 'yaml', nombre: 'YAML' },
  { id: 'ini', nombre: 'INI / TOML' },
  { id: 'xml', nombre: 'HTML / XML' },
  { id: 'css', nombre: 'CSS' },
  { id: 'sql', nombre: 'SQL' },
  { id: 'diff', nombre: 'Diff' },
  { id: 'dockerfile', nombre: 'Dockerfile' },
  { id: 'bash', nombre: 'Bash' },
  { id: 'powershell', nombre: 'PowerShell' },
  { id: 'javascript', nombre: 'JavaScript' },
  { id: 'typescript', nombre: 'TypeScript' },
  { id: 'python', nombre: 'Python' },
  { id: 'java', nombre: 'Java' },
  { id: 'csharp', nombre: 'C#' },
  { id: 'cpp', nombre: 'C++' },
  { id: 'c', nombre: 'C' },
  { id: 'go', nombre: 'Go' },
  { id: 'rust', nombre: 'Rust' },
  { id: 'php', nombre: 'PHP' },
  { id: 'kotlin', nombre: 'Kotlin' },
  { id: 'swift', nombre: 'Swift' },
  { id: 'ruby', nombre: 'Ruby' },
  { id: 'dart', nombre: 'Dart' },
  { id: 'r', nombre: 'R' },
  { id: 'lua', nombre: 'Lua' },
];

export const FORMATO_IDS = new Set(FORMATOS.map((f) => f.id));
export const nombreFormato = (id: string) => FORMATOS.find((f) => f.id === id)?.nombre ?? id;
