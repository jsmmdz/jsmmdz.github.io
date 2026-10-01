/**
 * Qué medio se ve (y cuánto se mezcla con el siguiente) según la posición del scroll virtual.
 *
 * Zero (ZK5): el medio cambia con un fundido ligado al scroll, sin curva propia. Aquí el fundido va
 * centrado en el límite entre capítulos: `u = clamp((pos − (b − 0,15·L)) / (0,3·L), 0, 1)` con
 * `b = k·L`, entre el medio k−1 y el k. Es matemática pura: la usan el controlador y las pruebas.
 */

/** Media ventana del fundido, en fracciones del tramo de un capítulo. */
export const MEDIA_VENTANA_FUNDIDO = 0.15;

export interface EstadoMedio {
  /** Medio base (el que se ve cuando la mezcla es 0). */
  medio: number;
  /** 0..1: cuánto del medio siguiente (`medio + 1`) se mezcla encima. */
  mezcla: number;
}

const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** `n` es la cantidad de capítulos (y de medios). En el límite exacto: medio k−1 y mezcla 0,5. */
export function estadoDelMedio(pos: number, tramo: number, n: number): EstadoMedio {
  const x = tramo > 0 ? pos / tramo : 0;
  const k = Math.round(x);
  if (k >= 1 && k <= n - 1 && Math.abs(x - k) <= MEDIA_VENTANA_FUNDIDO) {
    return { medio: k - 1, mezcla: acotar((x - (k - MEDIA_VENTANA_FUNDIDO)) / (2 * MEDIA_VENTANA_FUNDIDO), 0, 1) };
  }
  return { medio: acotar(Math.floor(x + MEDIA_VENTANA_FUNDIDO), 0, n - 1), mezcla: 0 };
}
