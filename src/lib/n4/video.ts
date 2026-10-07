/**
 * El marco de la foto cuando el paso trae un corto vertical (T38, autor 2026-10-04): los spots de Bernarte son
 * 9:16 y no caben en el 16:10 sin barras. El marco vertical tiene el mismo alto que el 16:10 y va centrado
 * donde va la foto. Es matemática pura: la usan el controlador (el área del clic) y el mundo WebGL.
 */
import type { RectPortada } from './portada';

/** Proporción (ancho / alto) del marco vertical. */
export const PROPORCION_VERTICAL = 9 / 16;

/** El rectángulo de la foto de un paso a partir de la caja 16:10 del CSS: la misma, o la vertical centrada. */
export function rectDelMedio(caja: RectPortada, vertical: boolean): RectPortada {
  if (!vertical) return caja;
  const width = caja.height * PROPORCION_VERTICAL;
  return { x: caja.x + (caja.width - width) / 2, y: caja.y, width, height: caja.height };
}
