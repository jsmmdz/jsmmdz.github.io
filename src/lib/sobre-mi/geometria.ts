/**
 * El largo de los bloques altos de «Sobre mí y contacto» (T45), en pantallas. Es la única fuente de estas cifras:
 * las leen el CSS (el alto de cada bloque, escrito por `SobreMi.astro`) y el JS (las paradas de la historia).
 *
 * Medidas de Tonami (K13, K14, K18): cada capítulo ocupa 1,5 pantallas de scroll y la primera parada queda unos
 * 270 px (0,3 pantallas a 900) después de la entrada.
 */

/** Alto del bloque «Sobre mí»: el escenario queda fijo 4,5 pantallas y la última lo despide. */
export const PANTALLAS_SOBRE_MI = 5.5;
/** El puente hacia la historia: la línea que se vuelve resorte, la estrella que cae y las palabras. */
export const PANTALLAS_PUENTE = 2.4;
/** Pantallas de scroll antes de la primera parada de la historia (K13). */
export const HISTORIA_ENTRADA = 0.3;
/** Pantallas de scroll de cada capítulo (K13). */
export const HISTORIA_POR_CAPITULO = 1.5;
/** El cierre: paneo del escenario, la estrella sola, el interludio y la vuelta a la página clara (K18). */
export const HISTORIA_CIERRE = 3.6;
/** El escenario fijo se va hacia arriba en la última pantalla. */
export const HISTORIA_SALIDA = 1;
/** El paneo del escenario dentro del cierre, en pantallas. */
export const HISTORIA_PANEO = 1.8;

/** Pantallas de alto del bloque de la historia con `capitulos` capítulos. */
export function pantallasHistoria(capitulos: number): number {
  return HISTORIA_ENTRADA + HISTORIA_POR_CAPITULO * capitulos + HISTORIA_CIERRE + HISTORIA_SALIDA;
}
