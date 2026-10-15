/**
 * La cámara del N2 con la unidad del responsive (T39).
 *
 * El cilindro proyectado mide lo que mide a 1440 × 900 por `u` (`lib/unidad.ts`): 764 px de ancho a 1440 × 900.
 * Con el fov vertical fijo en 40° el cilindro solo seguía al alto de la ventana; ahora sigue a la unidad:
 *   - cuando manda el alto (`u = alto / 900`) el fov se queda en 40°;
 *   - cuando manda el ancho, o pasada la unidad tope (2560 de ancho), el fov vertical se abre y al lado se ve más
 *     escena: `tan(fov / 2) = tan(20°) · alto / (900 · u)`.
 * En vertical (alto ≥ ancho) el N2 queda como estaba (fov de 40°): lo rehace T41.
 *
 * Se recalcula al cambiar el tamaño de la ventana y al crear la cámara, no en cada cuadro.
 */
import type { PerspectiveCamera } from 'three';
import { UNIDAD_REF, unidad } from '@/lib/unidad';

/** El fov vertical con el que se calibró el N2 (grados). */
export const FOV_N2 = 40;

const RAD = Math.PI / 180;

/** Fov vertical (grados) para una ventana de `ancho` × `alto` px CSS. */
export function fovN2(ancho: number, alto: number): number {
  if (!(ancho > alto) || alto <= 0) return FOV_N2;
  const tangente = (Math.tan((FOV_N2 / 2) * RAD) * alto) / (UNIDAD_REF.alto * unidad(ancho, alto));
  return (2 * Math.atan(tangente)) / RAD;
}

/** Pone el aspecto y el fov de la cámara del N2 para el tamaño del contenedor. */
export function ajustarCamaraN2(camara: PerspectiveCamera, ancho: number, alto: number): void {
  camara.aspect = ancho / alto;
  camara.fov = fovN2(ancho, alto);
  camara.updateProjectionMatrix();
}
