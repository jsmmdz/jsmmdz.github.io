/**
 * Dónde cae el medio del caso de estudio (N4) en escritorio, en el rem de Landberg.
 *
 * Una sola fuente para dos lectores: `N4CasoDeEstudio.astro` la vuelca a variables CSS y maqueta con
 * ellas, y el vuelo del N3 (`lib/three/n3/controlador.ts`) calcula con las mismas cifras el
 * rectángulo adonde tiene que llegar la pieza antes de que exista la página del caso. Si se cambia
 * una cifra aquí, cambian las dos cosas a la vez (T31: x 63 rem, y 6 rem, 70 rem de ancho y 16:10).
 *
 * El rem del N4 es el de Landberg y el del N3: `clamp(5px, 0,6667 vw, 20px)` (9,6 px a 1440).
 */

/** Medidas del medio del N4 a partir de 1024 px de ancho. */
export const N4_MEDIO = {
  /** Esquina izquierda del medio, en rem. */
  xRem: 63,
  /** Borde de arriba del medio, en rem. */
  yRem: 6,
  /** Ancho del medio, en rem. */
  anchoRem: 70,
  /** Proporción del medio (ancho / alto). */
  proporcion: 16 / 10,
  /** Por debajo de este ancho el N4 es una página apilada con scroll normal: no hay vuelo. */
  anchoMinEscritorioPx: 1024,
} as const;

const REM_POR_VW = 0.6667 / 100;
const REM_MIN_PX = 5;
const REM_MAX_PX = 20;

export interface RectPortada {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 1 rem del N3 y del N4 (px CSS) para un ancho de ventana (el `vw` cuenta la barra, como `innerWidth`). */
export function remDeVentana(anchoVentana: number): number {
  return Math.min(REM_MAX_PX, Math.max(REM_MIN_PX, anchoVentana * REM_POR_VW));
}

/** Variables CSS con las que el N4 maqueta su medio (sin unidad: se multiplican por 1 rem). */
export function variablesCssPortada(): string {
  const m = N4_MEDIO;
  return [
    `--n4-medio-x: ${m.xRem}`,
    `--n4-medio-y: ${m.yRem}`,
    `--n4-medio-ancho: ${m.anchoRem}`,
    `--n4-proporcion: ${m.proporcion}`,
  ].join('; ');
}

/**
 * Rectángulo (px CSS de la ventana) del medio del N4 al abrir la página, o null si la ventana es más
 * angosta que el escritorio del N4. No lee el DOM: sirve antes de que la página del caso exista.
 */
export function rectPortadaN4(anchoVentana: number): RectPortada | null {
  const m = N4_MEDIO;
  if (anchoVentana < m.anchoMinEscritorioPx) return null;
  const rem = remDeVentana(anchoVentana);
  const width = m.anchoRem * rem;
  return { x: m.xRem * rem, y: m.yRem * rem, width, height: width / m.proporcion };
}
