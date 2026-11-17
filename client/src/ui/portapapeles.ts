// Copia con la API moderna y, si no existe (páginas sin HTTPS), con un textarea oculto.
// Devuelve false si no se pudo copiar de ninguna forma.
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const previo = document.activeElement as HTMLElement | null;
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
    document.body.appendChild(area);
    area.select();
    area.setSelectionRange(0, texto.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    previo?.focus();
    return ok;
  }
}
