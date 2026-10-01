/**
 * Scroll virtual del caso (ZK1 y ZK2 de la ficha de Zero).
 *
 * El documento del N4 no se desplaza. Dos números mandan: el objetivo (adónde quiere ir el caso) y la
 * posición (dónde está), en px virtuales. La rueda y el teclado mueven el objetivo; la posición lo
 * persigue con un damp normalizado por el delta de tiempo, `1 − e^(−k·dt)` con k = 4,67 s⁻¹ (0,075 por
 * cuadro a 60 fps). Cada capítulo ocupa 1,75 alturas de ventana de recorrido. No hay
 * `requestAnimationFrame` propio: `update(dt)` lo llama el reloj único.
 */

// Damp de Zero: 0,075 por cuadro a 60 fps
const K_DAMP = 4.67;
// Tramo de cada capítulo, en alturas de ventana (el capítulo 1 de Zero: 175 vh)
const TRAMO_POR_ALTO = 1.75;
// Rueda: ±500 por evento y 0,35 px virtuales por unidad
const TOPE_RUEDA = 500;
const POR_RUEDA = 0.35;
// A menos de medio píxel, la posición se asienta exacta
const UMBRAL_ASENTADO = 0.5;
// Ancla de cada capítulo: cae después del fundido del medio
const ANCLA_EN_TRAMO = 0.2;
// Flechas ↓/↑
const PASO_FLECHA = 0.1;

export interface OpcionesScrollCaso {
  alto: () => number;
  /** Cantidad de capítulos. */
  capitulos: () => number;
  /** Las entradas se ignoran (mientras vuela la pieza). */
  bloqueado: () => boolean;
  /** Si el foco está en un control propio, las teclas no mueven el caso. */
  focoEnControl: () => boolean;
}

export class ScrollCaso {
  /** Posición actual (px virtuales). */
  pos = 0;
  /** Objetivo (px virtuales). */
  objetivo = 0;

  constructor(private readonly opc: OpcionesScrollCaso) {}

  /** Tramo de un capítulo (px virtuales). */
  get tramo(): number {
    return TRAMO_POR_ALTO * Math.max(1, this.opc.alto());
  }

  /** Recorrido total del caso. */
  get total(): number {
    return this.opc.capitulos() * this.tramo;
  }

  /** Capítulo en el que está la posición: `min(n − 1, floor(pos / L))`. */
  get capitulo(): number {
    return Math.min(this.opc.capitulos() - 1, Math.max(0, Math.floor(this.pos / this.tramo)));
  }

  /** Avance 0..1 del caso completo. */
  get progreso(): number {
    return this.total > 0 ? Math.min(1, Math.max(0, this.pos / this.total)) : 0;
  }

  /** Dónde queda el capítulo k al saltar a él: k·L + 0,2·L (el primero, en 0). */
  ancla(k: number): number {
    return k <= 0 ? 0 : k * this.tramo + ANCLA_EN_TRAMO * this.tramo;
  }

  /** Salta (con la inercia de siempre) al ancla del capítulo k. */
  irAlCapitulo(k: number): void {
    const n = this.opc.capitulos();
    this.objetivo = this.acotar(this.ancla(Math.min(n - 1, Math.max(0, k))));
  }

  /** Ancla del capítulo siguiente; en el último, el final del caso. */
  private siguiente(actual: number): void {
    if (actual >= this.opc.capitulos() - 1) this.objetivo = this.total;
    else this.irAlCapitulo(actual + 1);
  }

  private acotar(v: number): number {
    return Math.min(this.total, Math.max(0, v));
  }

  /** Engancha rueda y teclado; todo se suelta con la señal. */
  conectar(signal: AbortSignal): void {
    window.addEventListener('wheel', this.alRueda, { passive: false, signal });
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

  private alTecla = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.opc.bloqueado() || this.opc.focoEnControl()) return;
    const n = this.opc.capitulos();
    const actual = Math.min(n - 1, Math.max(0, Math.floor(this.objetivo / this.tramo)));
    switch (e.key) {
      case 'PageDown':
        e.preventDefault();
        this.siguiente(actual);
        break;
      case ' ':
        e.preventDefault();
        if (e.shiftKey) this.irAlCapitulo(actual - 1);
        else this.siguiente(actual);
        break;
      case 'PageUp':
        e.preventDefault();
        this.irAlCapitulo(actual - 1);
        break;
      case 'Home':
        e.preventDefault();
        this.objetivo = 0;
        break;
      case 'End':
        e.preventDefault();
        this.objetivo = this.total;
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
