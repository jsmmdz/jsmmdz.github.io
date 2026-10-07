/**
 * Scroll virtual del caso (ZK1 y ZK2 de la ficha de Zero) con los pasos de la historia (T32).
 *
 * El documento del N4 no se desplaza. Dos números mandan: el objetivo (adónde quiere ir el caso) y la
 * posición (dónde está), en px virtuales. La rueda y el teclado mueven el objetivo; la posición lo
 * persigue con un damp normalizado por el delta de tiempo, `1 − e^(−k·dt)` con k = 4,67 s⁻¹ (0,075 por
 * cuadro a 60 fps). El dedo (un toque arrastrado, con eventos de puntero) mueve el objetivo 1 a 1 con los px del gesto. No hay `requestAnimationFrame` propio: `update(dt)` lo llama el reloj único.
 *
 * Tramos: P = 0,5 alturas de ventana. El título ocupa [0, P); el cristal k cruza el centro de la
 * pantalla en `cₖ = (k + 1,5)·P`. El objetivo se acota a [0, c_{N−1}]: termina con el último cristal al centro.
 * Si el caso trae design system, sus tramos (y la ancla del centro de la sección) los da `tramos`.
 */

// Damp de Zero: 0,075 por cuadro a 60 fps
const K_DAMP = 4.67;
/** Tramo de cada paso, en alturas de ventana (P). */
export const TRAMO_POR_ALTO = 0.5;
// Rueda: ±500 por evento y 0,35 px virtuales por unidad
const TOPE_RUEDA = 500;
const POR_RUEDA = 0.35;
// A menos de medio píxel, la posición se asienta exacta
const UMBRAL_ASENTADO = 0.5;
// Flechas ↓/↑: una décima del tramo
const PASO_FLECHA = 0.1;

/** Posición (px virtuales) en la que el cristal k cruza el centro, con `tramo` = P. */
export const centroDelPaso = (k: number, tramo: number) => (k + 1.5) * tramo;

/** Paso activo: −1 durante el título; si no, `min(N − 1, floor(pos / P) − 1)`. */
export function pasoEn(pos: number, tramo: number, n: number): number {
  if (tramo <= 0 || pos < tramo) return -1;
  return Math.min(n - 1, Math.floor(pos / tramo) - 1);
}

export interface OpcionesScrollCaso {
  alto: () => number;
  /** Cantidad de pasos de la historia. */
  pasos: () => number;
  /** Los tramos de las anclas de AvPág, en orden (el último es el final); por omisión, 0 … N − 1. */
  tramos?: () => number[];
  /** Las entradas se ignoran (mientras vuela la pieza). */
  bloqueado: () => boolean;
  /** Si el foco está en un control propio, las teclas no mueven el caso. */
  focoEnControl: () => boolean;
  /** Si el destino de un toque es un enlace, botón o campo: el gesto no mueve el caso y el toque llega al control. */
  esControl: (destino: EventTarget | null) => boolean;
}

export class ScrollCaso {
  /** Posición actual (px virtuales). */
  pos = 0;
  /** Objetivo (px virtuales). */
  objetivo = 0;
  /** `clientY` del dedo en el evento anterior; null si no hay un gesto de un dedo que mueva el caso. */
  private yDedo: number | null = null;
  private idDedo: number | null = null;
  /** Los dedos que están sobre la pantalla (por `pointerId`). */
  private readonly dedos = new Set<number>();

  constructor(private readonly opc: OpcionesScrollCaso) {}

  /** P: tramo de un paso (px virtuales). */
  get tramo(): number {
    return TRAMO_POR_ALTO * Math.max(1, this.opc.alto());
  }

  /** Los tramos de las anclas: los de `tramos` o, sin ellos, uno por paso. */
  private get tramosAncla(): number[] {
    const ts = this.opc.tramos?.();
    return ts && ts.length > 0 ? ts : Array.from({ length: Math.max(1, this.opc.pasos()) }, (_, k) => k);
  }

  /** Donde termina el caso: la última ancla (el último cristal) al centro. */
  get final(): number {
    const ts = this.tramosAncla;
    return centroDelPaso(ts[ts.length - 1], this.tramo);
  }

  /** Paso en el que está la posición. */
  get paso(): number {
    return pasoEn(this.pos, this.tramo, this.opc.pasos());
  }

  /** Avance 0..1 del caso completo: `pos / c_{N−1}`. */
  get progreso(): number {
    return this.final > 0 ? Math.min(1, Math.max(0, this.pos / this.final)) : 0;
  }

  /** Las anclas de AvPág y RePág: 0 y el centro de cada cristal (y el de la sección del design system). */
  private anclas(): number[] {
    return [0, ...this.tramosAncla.map((t) => centroDelPaso(t, this.tramo))];
  }

  private acotar(v: number): number {
    return Math.min(this.final, Math.max(0, v));
  }

  /** Engancha rueda, dedo y teclado; todo se suelta con la señal. */
  conectar(signal: AbortSignal): void {
    window.addEventListener('wheel', this.alRueda, { passive: false, signal });
    window.addEventListener('pointerdown', this.alTocar, { signal });
    window.addEventListener('pointermove', this.alArrastrar, { signal });
    window.addEventListener('pointerup', this.alSoltar, { signal });
    window.addEventListener('pointercancel', this.alSoltar, { signal });
    window.addEventListener('touchmove', this.alMoverToque, { passive: false, signal });
    window.addEventListener('keydown', this.alTecla, { signal });
  }

  /** Reescala posición y objetivo cuando cambia el alto de la ventana: el avance relativo se conserva. */
  reescalar(tramoAntes: number): void {
    if (tramoAntes <= 0 || tramoAntes === this.tramo) return;
    const f = this.tramo / tramoAntes;
    this.pos *= f;
    this.objetivo = this.acotar(this.objetivo * f);
  }

  /** Un paso del reloj. Devuelve true si la posición cambió. */
  update(dtSeg: number): boolean {
    const dt = Math.min(Math.max(dtSeg, 0.001), 0.25);
    const antes = this.pos;
    const falta = this.objetivo - this.pos;
    if (falta === 0) return false;
    if (Math.abs(falta) < UMBRAL_ASENTADO) this.pos = this.objetivo;
    else this.pos += falta * (1 - Math.exp(-K_DAMP * dt));
    return this.pos !== antes;
  }

  private alRueda = (e: WheelEvent): void => {
    // Ctrl + rueda es el zoom del navegador: no se toca
    if (e.ctrlKey) return;
    e.preventDefault();
    if (this.opc.bloqueado()) return;
    const unidad = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.opc.alto() : 1;
    const delta = Math.min(TOPE_RUEDA, Math.max(-TOPE_RUEDA, e.deltaY * unidad));
    this.objetivo = this.acotar(this.objetivo + delta * POR_RUEDA);
  };

  /**
   * El dedo se lee con eventos de puntero (`pointerType === 'touch'`) y no con `touchmove`: Chrome no
   * entrega `touchmove` a la página en los gestos sintéticos (CDP) ni cuando el gesto ya es un desplazamiento,
   * y los de puntero llegan siempre mientras `touch-action` no deje al navegador desplazar. Así se cuenta una
   * sola vez cada movimiento. Un dedo sobre algo que no es un control empieza el gesto; dos o más dedos son
   * el zoom del navegador y no mueven el caso.
   */
  private alTocar = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    this.dedos.add(e.pointerId);
    const solo = this.dedos.size === 1 && !this.opc.esControl(e.target);
    this.idDedo = solo ? e.pointerId : null;
    this.yDedo = solo ? e.clientY : null;
  };

  /** Arrastrar hacia arriba avanza. Sin inercia propia: la suavidad ya la da el damp de `update`. */
  private alArrastrar = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch' || e.pointerId !== this.idDedo || this.yDedo === null) return;
    const delta = this.yDedo - e.clientY;
    this.yDedo = e.clientY;
    if (this.opc.bloqueado()) return;
    this.objetivo = this.acotar(this.objetivo + delta);
  };

  /** Al levantar o cancelar el gesto termina; el dedo que queda de un zoom no reanuda el avance. */
  private alSoltar = (e: PointerEvent): void => {
    if (e.pointerType !== 'touch') return;
    this.dedos.delete(e.pointerId);
    this.idDedo = null;
    this.yDedo = null;
  };

  /** El documento no se desplaza: con un solo dedo, el navegador no debe robar el gesto (borde elástico, recarga). */
  private alMoverToque = (e: TouchEvent): void => {
    if (this.yDedo !== null && e.touches.length === 1 && e.cancelable) e.preventDefault();
  };

  /** Las teclas parten siempre del objetivo (no de la posición): varias pulsaciones seguidas se suman. */
  private alTecla = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.opc.bloqueado() || this.opc.focoEnControl()) return;
    const anclas = this.anclas();
    const siguiente = () => anclas.find((a) => a > this.objetivo + UMBRAL_ASENTADO) ?? this.final;
    const anterior = () => [...anclas].reverse().find((a) => a < this.objetivo - UMBRAL_ASENTADO) ?? 0;
    switch (e.key) {
      case 'PageDown':
        e.preventDefault();
        this.objetivo = siguiente();
        break;
      case ' ':
        e.preventDefault();
        this.objetivo = e.shiftKey ? anterior() : siguiente();
        break;
      case 'PageUp':
        e.preventDefault();
        this.objetivo = anterior();
        break;
      case 'Home':
        e.preventDefault();
        this.objetivo = 0;
        break;
      case 'End':
        e.preventDefault();
        this.objetivo = this.final;
        break;
      case 'ArrowDown':
        e.preventDefault();
        this.objetivo = this.acotar(this.objetivo + PASO_FLECHA * this.tramo);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.objetivo = this.acotar(this.objetivo - PASO_FLECHA * this.tramo);
        break;
      default:
        break;
    }
  };
}
