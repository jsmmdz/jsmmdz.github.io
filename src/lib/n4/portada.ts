/**
 * Dónde cae la portada del caso de estudio (N4) en escritorio.
 *
 * Una sola fuente para dos lectores: `N4CasoDeEstudio.astro` la vuelca a variables CSS y maqueta con
 * ellas, y el vuelo del N3 (`lib/three/n3/vuelo.ts`) calcula con las mismas cifras el rectángulo
 * adonde tiene que llegar la pieza antes de que exista la página del caso. Si se cambia una cifra
 * aquí, cambian las dos cosas a la vez (T30, decisión del autor del 2026-09-29).
 */

/** Medidas de la columna derecha de N4 a partir de 1024 px de ancho. */
export const N4_PORTADA = {
  /** La columna derecha empieza a max(42vw, 600px) del borde del contenido. */
  columnaVw: 42,
  columnaMinPx: 600,
  /** Ancho máximo de la columna derecha. */
  anchoMaxPx: 860,
  /** Ancho máximo del contenedor de N4. */
  contenedorMaxPx: 1440,
  /** Proporción de la portada (ancho / alto). */
  proporcion: 16 / 10,
  /** Por debajo de este ancho N4 apila las columnas: no hay vuelo a la portada. */
  anchoMinEscritorioPx: 1024,
} as const;

export interface RectPortada {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Variables CSS con las que N4 maqueta su columna derecha y su portada. */
export function variablesCssPortada(): string {
  const p = N4_PORTADA;
  return [
    `--n4-columna-vw: ${p.columnaVw}vw`,
    `--n4-columna-min: ${p.columnaMinPx}px`,
    `--n4-ancho-max: ${p.anchoMaxPx}px`,
    `--n4-contenedor-max: ${p.contenedorMaxPx}px`,
    `--n4-proporcion: ${p.proporcion}`,
  ].join('; ');
}

/** Lee un token de espacio (p. ej. `--espacio-lg`, en rem) y lo pasa a px. */
function tokenEnPx(nombre: string, respaldoRem: number, remPx: number): number {
  const crudo = getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  const n = parseFloat(crudo);
  if (!Number.isFinite(n)) return respaldoRem * remPx;
  return crudo.endsWith('px') ? n : n * remPx;
}

/**
 * Rectángulo (px CSS de la ventana) de la portada de N4 al abrir la página, o null si la ventana es
 * más angosta que el escritorio de N4. Se calcula con los mismos tokens de espacio que usa N4.
 */
export function rectPortadaN4(anchoVentana: number): RectPortada | null {
  const p = N4_PORTADA;
  if (anchoVentana < p.anchoMinEscritorioPx) return null;
  const remPx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  const padLateral = tokenEnPx('--espacio-lg', 2.25, remPx);
  const padSuperior = tokenEnPx('--espacio-2xl', 5.0625, remPx);
  const contenedor = Math.min(anchoVentana, p.contenedorMaxPx);
  const izquierdaContenedor = (anchoVentana - contenedor) / 2;
  const contenido = contenedor - 2 * padLateral;
  const desfase = Math.max((p.columnaVw / 100) * anchoVentana, p.columnaMinPx);
  const width = Math.min(p.anchoMaxPx, contenido - desfase);
  return {
    x: izquierdaContenedor + padLateral + desfase,
    y: padSuperior,
    width,
    height: width / p.proporcion,
  };
}
