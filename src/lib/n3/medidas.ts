/**
 * Dónde queda la tarjeta de un caso en la cinta del N3 cuando la cinta está centrada en ella.
 *
 * El regreso del N4 (la pieza vuela de vuelta a su sitio en la cinta) necesita ese rectángulo antes de
 * que el mundo exista. Son las mismas cifras que `.n3-tarjeta` en `N3PlanoInfinito.astro`
 * (`height: min(43.5svh, 55 rem)`, centrada en la ventana): si cambian allí, cambian aquí.
 */
import { remDeVentana, type RectPortada } from '@/lib/n4/portada';

/** Alto de la tarjeta: 43,5 % del alto de la ventana (K1), con tope de 55 rem. */
const ALTO_TARJETA_VH = 0.435;
const ALTO_TARJETA_REM = 55;

/** Rectángulo (px CSS de la ventana) de una tarjeta de proporción `aspecto` centrada en la cinta. */
export function rectTarjetaCentrada(anchoVentana: number, altoVentana: number, aspecto: number): RectPortada {
  const rem = remDeVentana(anchoVentana);
  const height = Math.min(ALTO_TARJETA_VH * altoVentana, ALTO_TARJETA_REM * rem);
  const width = height * aspecto;
  return { x: (anchoVentana - width) / 2, y: (altoVentana - height) / 2, width, height };
}
