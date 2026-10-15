/**
 * La unidad del responsive y las reglas de toque y letra (T39).
 *
 * Decisiones del autor del 2026-10-08 y del 2026-10-09 (`docs/1-PRODUCTO.md` § 7, «Responsive · T39–T43» y
 * «la base común · T39»; `docs/2-TECNICO.md` § Frontend, «Responsive»). Es la única fuente de estas cifras: la
 * leen el CSS (por el layout), el JS y las pruebas. La escribe el orquestador y los agentes no la editan
 * (`fabrica/proyecto/compuertas.json`, rutas protegidas): cambiar una cifra es cambiar una decisión del autor.
 */

/** Tamaño de referencia: a 1440 × 900 la unidad vale 1 y todo se ve como se calibró. */
export const UNIDAD_REF = { ancho: 1440, alto: 900 } as const;

/** Ancho desde el que la unidad deja de crecer: más allá, las escenas 3D muestran más mundo. */
export const UNIDAD_TOPE_ANCHO = 2560;

/**
 * La unidad: el lado que más aprieta, con tope en 2560 de ancho.
 * `u = min(ancho / 1440, alto / 900, 2560 / 1440)`. Ancho y alto en px CSS de la ventana (`innerWidth`, `innerHeight`).
 */
export function unidad(ancho: number, alto: number): number {
  return Math.min(ancho / UNIDAD_REF.ancho, alto / UNIDAD_REF.alto, UNIDAD_TOPE_ANCHO / UNIDAD_REF.ancho);
}

/** Bajo este ancho de pantalla la página se arma a 360 (`<meta name="viewport" content="width=360">`). */
export const PISO_PX = 360;

/** Área de toque mínima con dedo (`any-pointer: coarse`) y con ratón, en px CSS. */
export const TOQUE_TACTIL_PX = 44;
export const TOQUE_RATON_PX = 24;

/** Letra mínima de todo texto del DOM, y la de los campos del formulario (con 14 iOS hace zoom). */
export const LETRA_MIN_PX = 12;
export const LETRA_CAMPO_PX = 16;

/** El rem de Landberg en N3 y N4 a 1440 × 900 (0,6667 vw) y su piso, que se conserva en angosto. */
export const REM_LANDBERG_REF_PX = 9.6;
export const REM_LANDBERG_MIN_PX = 5;

/** 1 rem del N3 y del N4 (desde 1024 de ancho) para una ventana: el de 1440 × 900 escalado por la unidad. */
export function remLandberg(ancho: number, alto: number): number {
  return Math.max(REM_LANDBERG_MIN_PX, REM_LANDBERG_REF_PX * unidad(ancho, alto));
}
