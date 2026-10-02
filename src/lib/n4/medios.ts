/**
 * Qué foto se ve (y cuánto se mezcla con la siguiente) según la posición del scroll virtual.
 *
 * Zero (K7): la mano cambia de textura con un fundido lineal por pares, ligado al mismo progreso que
 * mueve los cristales. Aquí la secuencia es la portada (medio −1, durante el título) y la foto de cada
 * paso (medio k). En cada límite `b = (k + 1)·P` la mezcla entre el medio k−1 y el k es
 * `u = clamp((pos − (b − 0,15·P)) / (0,3·P), 0, 1)`; con `u = 1` el medio base pasa a k y la mezcla
 * vuelve a 0. Con el cristal k al centro (`(k + 1,5)·P`) la foto k es pura.
 * Es matemática pura: la usan el controlador y el mundo WebGL.
 */

/** Media ventana del fundido, en fracciones del tramo de un paso. */
export const MEDIA_VENTANA_FUNDIDO = 0.15;

export interface EstadoMedio {
  /** Medio base (el que se ve cuando la mezcla es 0): −1 es la portada. */
  medio: number;
  /** 0..1: cuánto del medio siguiente (`medio + 1`) se mezcla encima. */
  mezcla: number;
}

const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Mezcla del límite k (entre el medio k−1 y el k) para una posición `pos` y un tramo `tramo` = P. */
export function mezclaDelLimite(k: number, pos: number, tramo: number): number {
  if (tramo <= 0) return 0;
  return acotar((pos / tramo - (k + 1 - MEDIA_VENTANA_FUNDIDO)) / (2 * MEDIA_VENTANA_FUNDIDO), 0, 1);
}

/** `n` es la cantidad de pasos (la portada es el medio −1 y hay `n` fotos más). */
export function estadoDelMedio(pos: number, tramo: number, n: number): EstadoMedio {
  let medio = -1;
  for (let k = 0; k < n; k++) {
    const u = mezclaDelLimite(k, pos, tramo);
    if (u >= 1) medio = k;
    else if (u > 0) return { medio: k - 1, mezcla: u };
    else break;
  }
  return { medio, mezcla: 0 };
}
