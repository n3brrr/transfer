import { useMemo } from 'react';
import { qrMatriz } from '../files/qr';

const MARGEN = 4; // zona en blanco que exige el estándar alrededor del código

// Código QR en SVG. No pinta nada si el texto no cabe (versión 7 como máximo).
export default function QrCodigo({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const matriz = useMemo(() => qrMatriz(texto), [texto]);
  if (!matriz) return null;
  const lado = matriz.length + MARGEN * 2;
  const trazo = matriz.flatMap((fila, r) => fila.map((oscuro, c) => (oscuro ? `M${c + MARGEN} ${r + MARGEN}h1v1h-1z` : ''))).join('');
  return (
    <svg viewBox={`0 0 ${lado} ${lado}`} role="img" aria-label={etiqueta} shapeRendering="crispEdges" className="size-44 max-w-full rounded-xl bg-superficie text-tinta">
      <path d={trazo} fill="currentColor" />
    </svg>
  );
}
