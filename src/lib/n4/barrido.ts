/**
 * El texto de cada capítulo entra con el barrido de Zero (ZK3) y sale con un fundido de 0,3 s.
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
/** Fundido de salida del capítulo que se va (s). */
export const DURACION_SALIDA = 0.3;
// Desenfoque del borde: 0,5 rem al empezar, bajando con el cuadrado de 1 − u
const DESENFOQUE_REM = 0.5;
// Medio ancho de la banda suave del borde, en fracciones del ancho del bloque
const MEDIA_BANDA = 0.2;
// Paradas del degradado de la máscara
const PARADAS = 24;

const outExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const suave = (t: number) => t * t * (3 - 2 * t);
const smoothstep = (a: number, b: number, x: number) => suave(Math.min(1, Math.max(0, (x - a) / (b - a))));

const FOCALIZABLES = 'a[href], button, input, select, textarea, [tabindex], [contenteditable]';

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

export interface OpcionesTexto {
  remPx: () => number;
  reducido: () => boolean;
}

/** Los bloques de texto de los capítulos: uno visible a la vez, los demás en el mismo sitio, invisibles. */
export class TextoCapitulos {
  private activo = -1;
  private readonly tweens = new Map<HTMLElement, gsap.core.Tween>();

  constructor(
    private readonly bloques: HTMLElement[],
    private readonly opc: OpcionesTexto,
  ) {}

  /** Deja todos los bloques apagados; ninguno recibe foco. */
  preparar(): void {
    for (const b of this.bloques) {
      gsap.set(b, { opacity: 0 });
      this.ajustarFoco(b, false);
    }
  }

  /** Muestra el capítulo `k` con su barrido, `retraso` segundos después de ahora (la entrada). */
  entrar(k: number, retraso: number): Tween | null {
    const bloque = this.bloques[k];
    if (!bloque) return null;
    this.activo = k;
    return this.encender(bloque, retraso);
  }

  /** Cambia al capítulo `k`: el que está sale en 0,3 s y el nuevo entra con el barrido. */
  cambiar(k: number): void {
    if (k === this.activo) return;
    const anterior = this.bloques[this.activo];
    this.activo = k;
    if (anterior) this.apagar(anterior);
    const nuevo = this.bloques[k];
    if (nuevo) this.encender(nuevo, 0);
  }

  private encender(bloque: HTMLElement, retraso: number): Tween | null {
    this.tweens.get(bloque)?.kill();
    gsap.killTweensOf(bloque);
    gsap.set(bloque, { opacity: 1 });
    this.ajustarFoco(bloque, true);
    if (this.opc.reducido()) {
      quitarBarrido(bloque);
      return null;
    }
    const t = barrer(bloque, retraso, this.opc.remPx());
    this.tweens.set(bloque, t);
    return t;
  }

  private apagar(bloque: HTMLElement): void {
    this.tweens.get(bloque)?.kill();
    this.tweens.delete(bloque);
    this.ajustarFoco(bloque, false);
    if (this.opc.reducido()) {
      gsap.killTweensOf(bloque);
      gsap.set(bloque, { opacity: 0 });
      quitarBarrido(bloque);
      return;
    }
    gsap.to(bloque, {
      opacity: 0,
      duration: DURACION_SALIDA,
      ease: suave,
      overwrite: true,
      onComplete: () => quitarBarrido(bloque),
    });
  }

  /** Lo que no se ve no recibe foco: los controles de un bloque apagado salen del orden de Tab. */
  private ajustarFoco(bloque: HTMLElement, visible: boolean): void {
    for (const el of bloque.querySelectorAll<HTMLElement>(FOCALIZABLES)) {
      if (visible) {
        if (el.dataset.n4Tab !== undefined) {
          if (el.dataset.n4Tab === '') el.removeAttribute('tabindex');
          else el.setAttribute('tabindex', el.dataset.n4Tab);
          delete el.dataset.n4Tab;
        }
      } else if (el.dataset.n4Tab === undefined) {
        el.dataset.n4Tab = el.getAttribute('tabindex') ?? '';
        el.setAttribute('tabindex', '-1');
      }
    }
  }

  /** Suelta los tweens y deja los bloques como el HTML los trajo. */
  destruir(): void {
    for (const b of this.bloques) {
      this.tweens.get(b)?.kill();
      gsap.killTweensOf(b);
    }
    this.tweens.clear();
  }
}

type Tween = gsap.core.Tween;
