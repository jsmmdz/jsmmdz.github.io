/**
 * Curva «ro» del vuelo de la pieza al caso (K16): tres Béziers cúbicas unidas en los puntos
 * (0,0), (0.157,0.29), (0.348,0.884) y (1,1). Arranca casi de golpe y frena largo.
 * Es matemática pura: no toca el DOM ni WebGL.
 */

type Punto = readonly [number, number];
type Tramo = readonly [Punto, Punto, Punto, Punto];

const TRAMOS: readonly Tramo[] = [
  [[0, 0], [0.094, 0.026], [0.124, 0.127], [0.157, 0.29]],
  [[0.157, 0.29], [0.197, 0.486], [0.254, 0.8], [0.348, 0.884]],
  [[0.348, 0.884], [0.42, 0.949], [0.374, 1], [1, 1]],
];

const bezier = (a: number, b: number, c: number, d: number, u: number): number => {
  const v = 1 - u;
  return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d;
};

/** Progreso 0..1 a partir del tiempo normalizado 0..1. */
export function ro(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const tramo = TRAMOS.find((t) => x <= t[3][0]) ?? TRAMOS[TRAMOS.length - 1];
  const [p0, p1, p2, p3] = tramo;
  // Se busca el parámetro u con x(u) = x por bisección (x es monótona en cada tramo)
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (bezier(p0[0], p1[0], p2[0], p3[0], mid) < x) lo = mid;
    else hi = mid;
  }
  return bezier(p0[1], p1[1], p2[1], p3[1], (lo + hi) / 2);
}
