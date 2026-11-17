// Miniatura JPEG diminuta de una imagen, para enseñarla en la lista del otro dispositivo sin enviar el archivo.
const LADO = 96; // píxeles del lado mayor
const TIPOS = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp']); // sin SVG: puede llevar scripts
const MAX_ARCHIVO = 30 * 1024 * 1024; // más grande que esto no se decodifica solo para una miniatura
export const MAX_MINIATURA = 12_000; // caracteres de la data URL; el receptor rechaza lo que pase de aquí

// null si no es una imagen admitida o no se pudo generar (la lista usa entonces el icono de siempre)
export async function crearMiniatura(file: File): Promise<string | null> {
  if (!TIPOS.has(file.type) || file.size > MAX_ARCHIVO || typeof createImageBitmap !== 'function') return null;
  let bitmap: ImageBitmap | null = null;
  try {
    // Se reduce al decodificar: una foto de 48 MP no ocupa 190 MB en memoria
    bitmap = await createImageBitmap(file, { resizeWidth: LADO, resizeQuality: 'medium' });
    const escala = Math.min(1, LADO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#fff'; // el JPEG no tiene transparencia
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const url = canvas.toDataURL('image/jpeg', 0.6);
    return url.length <= MAX_MINIATURA ? url : null;
  } catch {
    return null;
  } finally {
    bitmap?.close();
  }
}
