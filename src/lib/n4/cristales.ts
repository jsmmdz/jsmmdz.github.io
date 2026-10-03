/**
 * La pose de los cristales de la historia (K3 y K9 de la ficha de Zero, con la meseta del autor).
 *
 * Todo es función de la posición del scroll virtual: no hay tiempos fijos. Un cristal sube ligado al
 * scroll, entra por el borde de abajo y sale por el de arriba por su posición (nunca con un fundido).
 * La altura de su centro sobre el centro de la meseta es `D·alto·g(s)` con `s = (pos − cₖ)/P` y
 * `g(s) = s − (m/2π)·sin(2πs)`: la pendiente en el centro es `1 − m`, así que el cristal frena al cruzar.
 * Es matemática pura (no toca el DOM ni WebGL): la usan el mundo WebGL y los respaldos.
 */
import { mezclaDelLimite } from './medios';
import { centroDelPaso } from './scroll';

/** D: distancia entre dos cristales seguidos, en alturas de ventana. */
export const RECORRIDO = 0.5;
/** m: cuánto frena el cristal al cruzar el centro (la meseta). */
export const MESETA = 0.8;

/** x del centro de cada cristal en la columna (K3), en unidades de 50 rem; en ciclo para k ≥ 7. */
export const X_CRISTAL = [0.02, -0.06, 0.08, -0.04, 0.05, -0.08, 0.05] as const;

/** Giro inicial → final de cada cristal (K3, rad); en ciclo para k ≥ 7. */
export const GIRO_CRISTAL: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
  [[0.1, -0.05, 0.15], [0.25, 0.2, -0.4]],
  [[0.05, 0.12, -0.3], [-0.15, -0.25, 0.5]],
  [[-0.08, -0.1, 0.45], [0.2, 0.15, -0.6]],
  [[0.12, 0.08, -0.2], [-0.1, 0.3, 0.35]],
  [[-0.05, -0.15, 0.55], [0.18, -0.2, -0.45]],
  [[0.15, 0.05, -0.1], [-0.2, 0.1, 0.65]],
  [[-0.1, 0.12, 0.35], [0.15, -0.15, -0.55]],
];

/** |z| de cada cristal en la escena de Zero (K3): decide cuánto lo corre el paralaje. */
export const PROFUNDIDAD_CRISTAL = [0.4, 0.88, 0.95, 0.85, 0.6, 1.2, 0.98] as const;

const TAU = Math.PI * 2;
const acotar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/** Avance del cristal con la meseta en el centro: g′(0) = 1 − m. */
export const avanceConMeseta = (s: number) => s - (MESETA / TAU) * Math.sin(TAU * s);

/** Altura (px hacia arriba, desde el centro de la meseta) del centro del cristal k en la posición `pos`. */
export function alturaDelCristal(k: number, pos: number, tramo: number, altoPx: number): number {
  return RECORRIDO * altoPx * avanceConMeseta((pos - centroDelPaso(k, tramo)) / tramo);
}

/**
 * Interpolación del giro de K3: `u = clamp((g(s) + 1,5)/3, 0, 1)`. `t` es el tramo en que el cristal cruza el
 * centro (con design system, el del resultado se corre uno); por omisión, su propio índice.
 */
export function giroDelCristal(k: number, pos: number, tramo: number, t = k): [number, number, number] {
  const [ini, fin] = GIRO_CRISTAL[k % GIRO_CRISTAL.length];
  const u = acotar((avanceConMeseta((pos - centroDelPaso(t, tramo)) / tramo) + 1.5) / 3, 0, 1);
  return [ini[0] + (fin[0] - ini[0]) * u, ini[1] + (fin[1] - ini[1]) * u, ini[2] + (fin[2] - ini[2]) * u];
}

/** El giro con el que se ve el cristal activo cuando no sube (movimiento reducido): el del centro. */
export function giroEnReposo(k: number): [number, number, number] {
  const [ini, fin] = GIRO_CRISTAL[k % GIRO_CRISTAL.length];
  return [(ini[0] + fin[0]) / 2, (ini[1] + fin[1]) / 2, (ini[2] + fin[2]) / 2];
}

// ---------- Cuánto se corre el fondo dentro del cristal (pulido de T32, `E2`) ----------

/**
 * Fuerza de la refracción (K4): cuánto desplaza la normal de la cara a la escena de detrás, en uv. La usa
 * el shader del vidrio (`lib/three/n4/glsl.ts`). Autor, 2026-10-02 (`E2`, opción C): baja de 0,25 a 0,15
 * para que el fondo se corra entre 10 y 60 px a 1440 en reposo, y el arcoíris sube aparte con la dispersión.
 */
export const REFRACCION_FUERZA = 0.15;

/** La normal de la cara de frente en espacio de vista con el giro Euler XYZ del cristal: (nx, ny). */
export function normalDeFrente(giro: readonly [number, number, number]): [number, number] {
  return [Math.sin(giro[1]), -Math.cos(giro[1]) * Math.sin(giro[0])];
}

/** Corrimiento medio (px) del fondo dentro de la cara del cristal k en reposo (sin balanceo ni escarcha). */
export function corrimientoEnReposo(k: number, anchoPx: number, altoPx: number): number {
  const [nx, ny] = normalDeFrente(giroEnReposo(k));
  return Math.hypot(nx * REFRACCION_FUERZA * anchoPx, ny * REFRACCION_FUERZA * altoPx);
}

// ---------- Generador con semilla: la forma, el giro y el balanceo se repiten entre cargas ----------

/** Generador pseudoaleatorio mulberry32: la misma semilla da siempre la misma secuencia. */
export function aleatorio(semilla: number): () => number {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Balanceo {
  /** Amplitud (rad), frecuencia (rad/s) y fase (rad) de cada eje. */
  a: [number, number, number];
  f: [number, number, number];
  p: [number, number, number];
}

/** Balanceo lento del cristal k (K3): amplitud de 4° a 12°, frecuencia de 0,15 a 0,45 rad/s. Con semilla fija. */
export function balanceoDelCristal(k: number, base = 7001): Balanceo {
  const r = aleatorio(base + k * 977);
  const eje = (): [number, number, number] => [r(), r(), r()];
  const gr = Math.PI / 180;
  const [a0, a1, a2] = eje();
  const [f0, f1, f2] = eje();
  const [p0, p1, p2] = eje();
  return {
    a: [(4 + 8 * a0) * gr, (4 + 8 * a1) * gr, (4 + 8 * a2) * gr],
    f: [0.15 + 0.3 * f0, 0.15 + 0.3 * f1, 0.15 + 0.3 * f2],
    p: [p0 * TAU, p1 * TAU, p2 * TAU],
  };
}

/** Giro extra del balanceo en el instante `t` (s). */
export function girarBalanceo(b: Balanceo, t: number): [number, number, number] {
  return [b.a[0] * Math.sin(b.f[0] * t + b.p[0]), b.a[1] * Math.sin(b.f[1] * t + b.p[1]), b.a[2] * Math.sin(b.f[2] * t + b.p[2])];
}

/**
 * Cuánto se ve el cristal k cuando no sube (movimiento reducido o sin WebGL): entra con la mezcla del
 * límite anterior y sale con la del siguiente, las mismas `u` que funden las fotos. El primero entra con
 * la portada → foto 0; el último no sale.
 */
export function opacidadDelPaso(k: number, pos: number, tramo: number, n: number): number {
  const entra = mezclaDelLimite(k, pos, tramo);
  const sale = k + 1 < n ? mezclaDelLimite(k + 1, pos, tramo) : 0;
  return entra * (1 - sale);
}
