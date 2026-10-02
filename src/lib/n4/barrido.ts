/**
 * El título del caso entra con el barrido de Zero (ZK3).
 *
 * Zero lo hace en un shader sobre un atlas de imágenes: un progreso `u` de 0 a 1 en 4 s con outExpo,
 * `u′ = 1,3·u`, y una máscara que deja ver el texto de izquierda a derecha con un borde suave y
 * desenfocado que se enfoca al pasar. Aquí el texto es DOM y la técnica se reimplementa con una
 * máscara CSS que mueve GSAP en el reloj único: `mask-image` con un borde que avanza y un
 * `filter: blur` que baja con `u`. El ruido del borde de Zero queda para el pulido.
 *
 * Todo lo que se anima aquí es GSAP, no transiciones CSS: las pruebas congelan el reloj de la página.
 */
import gsap from 'gsap';

/** Duración del barrido de entrada (s), con outExpo. */
export const DURACION_BARRIDO = 4;
// Desenfoque del borde: 0,5 rem al empezar, bajando con el cuadrado de 1 − u
const DESENFOQUE_REM = 0.5;
// Medio ancho de la banda suave del borde, en fracciones del ancho del bloque
const MEDIA_BANDA = 0.2;
// Paradas del degradado de la máscara
const PARADAS = 24;

const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const suave = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => suave(Math.min(1, Math.max(0, (x - a) / (b - a))));

/** Máscara de izquierda a derecha para un progreso `u` (0 todo oculto, 1 todo visible). */
function mascara(u: number): string {
  // El centro del borde recorre de −0,2 a 1,3 para que en 0 no se vea nada y en 1 se vea todo
  const centro = -0.2 + 1.5 * u;
  const paradas: string[] = [];
  for (let i = 0; i <= PARADAS; i++) {
    const x = i / PARADAS;
    const alfa = 1 - smoothstep(centro - MEDIA_BANDA, centro + MEDIA_BANDA, x);
    paradas.push(`rgba(0, 0, 0, ${alfa.toFixed(3)}) ${(x * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${paradas.join(', ')})`;
}

/** Pone el barrido en el progreso `u`: máscara y desenfoque. */
export function aplicarBarrido(el: HTMLElement, u: number, remPx: number): void {
  const m = mascara(u);
  el.style.maskImage = m;
  const b = DESENFOQUE_REM * remPx * (1 - u) * (1 - u);
  el.style.filter = b > 0.05 ? `blur(${b.toFixed(2)}px)` : '';
}

/** Quita el barrido: el texto queda tal cual, sin máscara ni filtro. */
export function quitarBarrido(el: HTMLElement): void {
  el.style.removeProperty('mask-image');
  el.style.removeProperty('filter');
}

/**
 * Entrada con barrido: 4 s con outExpo, `retraso` segundos después de ahora. Mientras espera el
 * elemento queda oculto por la máscara (en u = 0). Devuelve el tween para poder esperarlo.
 */
export function barrer(el: HTMLElement, retraso: number, remPx: number): gsap.core.Tween {
  const estado = { u: 0 };
  aplicarBarrido(el, 0, remPx);
  return gsap.to(estado, {
    u: 1,
    duration: DURACION_BARRIDO,
    delay: retraso,
    ease: outExpo,
    onUpdate: () => aplicarBarrido(el, estado.u, remPx),
    onComplete: () => quitarBarrido(el),
  });
}
