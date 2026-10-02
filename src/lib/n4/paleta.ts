/**
 * La exposición del design system (autor, 2026-10-02): al final del caso, si el contenido trae `paleta`,
 * cinco cristales pequeños teñidos de cada color, con su hexadecimal impreso. Ocupan un tramo más del
 * scroll, después del último paso de la historia: suben en cascada con la misma meseta que los cristales
 * de la historia y se quedan agrupados en la columna izquierda (3 arriba y 2 abajo).
 *
 * Es matemática pura (no toca el DOM ni WebGL): la usan el mundo WebGL, el controlador y las pruebas.
 */
import { avanceConMeseta, RECORRIDO } from './cristales';
import { mezclaDelLimite } from './medios';
import { centroDelPaso } from './scroll';

/** Ancho de cada cristal de la paleta, en anchos del cristal de la historia. */
export const ANCHO_COLOR = 0.4;
/** Dónde queda cada cristal en reposo, en anchos del cristal de la historia desde el centro de la meseta. */
export const LUGAR_COLOR: ReadonlyArray<readonly [number, number]> = [
  [-0.5, -0.2],
  [0, -0.24],
  [0.5, -0.18],
  [-0.26, 0.2],
  [0.27, 0.23],
];
/** Giro de reposo de cada cristal (rad): casi de frente, para que el color y el hexadecimal se lean. */
export const GIRO_COLOR: ReadonlyArray<readonly [number, number, number]> = [
  [0.12, -0.18, 0.1],
  [-0.08, 0.1, -0.06],
  [0.1, 0.16, 0.14],
  [-0.12, -0.12, -0.1],
  [0.08, 0.14, 0.08],
];
/** Cascada: cada cristal llega un poco después que el anterior, en fracciones del tramo. */
const CASCADA = 0.07;
/** Margen a los bordes de la ventana (px). */
const MARGEN_PX = 16;

/** Índice del tramo de la paleta: va después de los `n` pasos de la historia. */
export const tramoDePaleta = (n: number) => n;

export interface PoseColor {
  /** Centro del cristal (px de la ventana). */
  cx: number;
  cy: number;
  /** Ancho del cristal (px). */
  ancho: number;
  giro: [number, number, number];
}

/**
 * La pose del color i en la posición `pos`: sube como el cristal del tramo `n` de la historia y se asienta
 * en su lugar del grupo cuando ese tramo cruza el centro. En pantalla angosta el grupo se cierra para caber.
 */
export function poseColor(
  i: number,
  n: number,
  pos: number,
  tramo: number,
  d: { ancho: number; alto: number; columnaX: number; mesetaY: number; anchoCristal: number },
  reducido: boolean,
): PoseColor {
  const ancho = ANCHO_COLOR * d.anchoCristal;
  const [lx, ly] = LUGAR_COLOR[i % LUGAR_COLOR.length];
  // El grupo cabe a lo ancho: la mitad libre a cada lado del centro de la columna, menos medio cristal
  const libre = Math.min(d.columnaX, d.ancho - d.columnaX) - MARGEN_PX - (ancho * 1.16) / 2;
  const abre = Math.max(0, Math.min(d.anchoCristal, libre / 0.5));
  // El primero se adelanta 4 cascadas y el último ninguna: al final del scroll todos ya llegaron
  const s = (pos - centroDelPaso(tramoDePaleta(n), tramo)) / tramo + (LUGAR_COLOR.length - 1 - i) * CASCADA;
  // Al final del scroll (s ≈ 0) cada uno está en su lugar; antes viene subiendo desde abajo
  const altura = reducido ? 0 : RECORRIDO * d.alto * avanceConMeseta(Math.min(0, s));
  return {
    cx: d.columnaX + lx * abre,
    cy: d.mesetaY + ly * d.anchoCristal - altura,
    ancho,
    giro: [...GIRO_COLOR[i % GIRO_COLOR.length]] as [number, number, number],
  };
}

/** Cuánto se ve la paleta: con movimiento reducido entra con el fundido del límite de su tramo; si no, siempre. */
export function opacidadPaleta(n: number, pos: number, tramo: number, reducido: boolean): number {
  return reducido ? mezclaDelLimite(tramoDePaleta(n), pos, tramo) : 1;
}

/** Luminancia relativa de WCAG de un color `#RRGGBB`. */
function luminancia(hex: string): number {
  const canal = (k: number) => {
    const v = parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** El color del hexadecimal impreso: el que más contraste dé sobre el color del cristal (crema u oscuro). */
export function tintaSobre(hex: string, crema: string, oscuro: string): string {
  const l = luminancia(hex);
  const contra = (otro: string) => {
    const [a, b] = [l, luminancia(otro)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  return contra(crema) >= contra(oscuro) ? crema : oscuro;
}
