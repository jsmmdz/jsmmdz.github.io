/**
 * El título del caso va en Unbounded, en una sola línea y lo más grande que quepa: hasta 44 rem de
 * ancho sin pasar de 4,5 rem de alto de letra (en escritorio). El tamaño depende del texto y de la
 * fuente cargada, así que se mide: se pone a un tamaño de referencia, se mide el ancho de la línea y se
 * escala. Hace de la frase grande inicial de Zero (A9): se va cuando empieza la historia.
 */

// Referencia de la medida: el ancho de una línea es lineal con el tamaño de letra
const REFERENCIA_PX = 100;
// Un respiro para que el redondeo del navegador no lo saque de la columna
const MARGEN = 0.995;
// Toda espera tiene salida: si la fuente no llega a tiempo se mide con la de respaldo
const ESPERA_FUENTE_MS = 1500;

/** Ajusta el tamaño del título (px) a `anchoMaxPx` sin pasar de `tamanoMaxPx` de letra. */
export function ajustarTitulo(h1: HTMLElement, anchoMaxPx: number, tamanoMaxPx: number): void {
  // Con movimiento reducido el CSS global pone `transition-duration: 0.001s !important` en todo, y como
  // `transition-property` es `all` por defecto, el tamaño de letra dejaría de cambiar de golpe y la
  // medida saldría con el tamaño anterior. Inline e `important` para ganarle a esa regla.
  h1.style.setProperty('transition', 'none', 'important');
  h1.style.fontSize = `${REFERENCIA_PX}px`;
  const rango = document.createRange();
  rango.selectNodeContents(h1);
  const ancho = rango.getBoundingClientRect().width;
  if (ancho <= 0) {
    h1.style.removeProperty('font-size');
    return;
  }
  const quepa = (anchoMaxPx * MARGEN * REFERENCIA_PX) / ancho;
  h1.style.fontSize = `${Math.min(tamanoMaxPx, quepa).toFixed(2)}px`;
}

/** Espera (con tope) a que la fuente del título esté cargada para medirlo con ella. */
export async function fuenteDelTituloLista(): Promise<void> {
  try {
    await Promise.race([
      document.fonts.load('800 1em Unbounded'),
      new Promise<void>((listo) => window.setTimeout(listo, ESPERA_FUENTE_MS)),
    ]);
  } catch {
    // sin la fuente se mide con la de respaldo
  }
}
