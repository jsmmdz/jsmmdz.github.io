/**
 * Scroll virtual del N3 (K8 y K9 de la ficha de Landberg).
 *
 * Dos números mandan: el objetivo `t` (adónde quiere ir la cinta) y el actual `a` (dónde está).
 * Las entradas (rueda, arrastre, teclado) mueven `t`; `a` lo sigue con un damp normalizado por el
 * delta de tiempo: 1 − e^(−k·dt), con k = 6,32 s⁻¹ (= lerp 0,1 por cuadro a 60 fps). La velocidad V
 * sale del desfase t − a. No hay `requestAnimationFrame` propio: `update(dt)` lo llama el reloj único.
 */

// Damp de K8: lerp 0,1 por cuadro a 60 fps
const K_DAMP = 6.32;
// Divisor de la velocidad (px de desfase), escritorio
const DIVISOR_VELOCIDAD = 550;
// Rueda (K9)
const GANANCIA_RUEDA = 1.25;
const FACTOR_MUESCA = 2;
const UMBRAL_MUESCA = 40;
const SILENCIO_MUESCA_MS = 500;
const SUELTA_POR_CUADRO = 0.22;
// Arrastre (K9)
const GANANCIA_ARRASTRE = 1.5;
const UMBRAL_ARRASTRE = 10;
const LANZAMIENTO = 12;
const VENTANA_LANZAMIENTO_MS = 100;
// Teclas (K9)
const PASO_FLECHA = 100;
const PASO_PAGINA = 0.9;

export interface OpcionesScroll {
  /** Ancho de la ventana en px CSS (el tope suave del adelanto es una ventana de ancho). */
  ancho: () => number;
  alto: () => number;
  reducido: () => boolean;
  /** Las entradas se ignoran (por ejemplo, mientras vuela la pieza al caso). */
  bloqueado: () => boolean;
  /** Llamado cuando hay que mover la cinta a la tarjeta vecina: +1 derecha, −1 izquierda. */
  vecina: (direccion: 1 | -1) => void;
  /** Llamado cuando cambió el arrastre (para el cursor) y hay que despertar el dibujo. */
  alCambiarArrastre: (arrastrando: boolean) => void;
}

interface Arrastre {
  x0: number;
  y0: number;
  xUlt: number;
  yUlt: number;
  tUlt: number;
  ultimoDelta: number;
  activo: boolean;
}

export class ScrollVirtual {
  /** Posición actual (px CSS), redondeada a 0,01. */
  a = 0;
  /** Objetivo. */
  t = 0;
  /** Velocidad con signo, 0..1 en valor absoluto. */
  velocidad = 0;

  private pendiente = 0;
  private reserva = 0;
  private ultimoEvento = -Infinity;
  private arrastre: Arrastre | null = null;
  private bloqueaClic = false;

  constructor(private readonly opc: OpcionesScroll) {}

  /** Engancha los listeners de entrada; todos se sueltan con la señal. */
  conectar(signal: AbortSignal): void {
    window.addEventListener('wheel', this.alRueda, { passive: false, signal });
    window.addEventListener('keydown', this.alTecla, { signal });
    window.addEventListener('pointerdown', this.alPunteroAbajo, { signal });
    window.addEventListener('pointermove', this.alPunteroMover, { signal });
    window.addEventListener('pointerup', this.alPunteroArriba, { signal });
    window.addEventListener('pointercancel', this.alPunteroArriba, { signal });
    // En captura: el clic que sigue a un arrastre no debe abrir el caso
    window.addEventListener('click', this.alClic, { capture: true, signal });
  }

  /** Fija posición y objetivo de una vez (centrar al entrar). */
  saltarA(t: number): void {
    this.t = t;
    this.a = t;
    this.pendiente = 0;
    this.reserva = 0;
    this.velocidad = 0;
  }

  /** Mueve solo el objetivo (la cinta llega con su inercia). */
  irA(t: number): void {
    this.t = t;
  }

  /**
   * Suma un delta al objetivo. Rueda y arrastre llevan el tope suave de una ventana de adelanto;
   * las teclas mueven exactamente lo que dicen (±100 px, ±0,9 × alto), así que no lo llevan.
   */
  mover(delta: number, conTope = true): void {
    if (delta === 0) return;
    this.t += delta;
    if (!conTope || this.opc.reducido()) return;
    const w = Math.max(1, this.opc.ancho());
    this.t = this.a + Math.tanh((this.t - this.a) / w) * w;
  }

  get arrastrando(): boolean {
    return this.arrastre?.activo === true;
  }

  /** Un paso del reloj. Devuelve true si `a` o la velocidad cambiaron. */
  update(dtSeg: number): boolean {
    const dt = Math.min(Math.max(dtSeg, 0.001), 0.25);
    const aAntes = this.a;
    const velAntes = this.velocidad;

    // La rueda suelta lo acumulado: lo suave de una vez, la muesca un 22 % de lo que falta por cuadro
    const fraccion = 1 - Math.pow(1 - SUELTA_POR_CUADRO, dt * 60);
    let emitido = this.pendiente;
    this.pendiente = 0;
    if (this.reserva !== 0) {
      const parte = this.reserva * fraccion;
      emitido += parte;
      this.reserva -= parte;
      if (Math.abs(this.reserva) < 0.01) {
        emitido += this.reserva;
        this.reserva = 0;
      }
    }
    if (emitido !== 0) this.mover(emitido);

    if (this.opc.reducido()) {
      this.a = this.t;
      this.velocidad = 0;
    } else {
      const lag = this.t - this.a;
      if (Math.abs(lag) < 0.05) {
        // El redondeo a 0,01 dejaría un resto que nunca se cierra: se asienta exacto
        this.a = this.t;
      } else {
        this.a += lag * (1 - Math.exp(-K_DAMP * dt));
        this.a = Math.round(this.a * 100) / 100;
      }
      // V = vel·|vel| con su signo: respuesta cuadrática; |vel| < 1, así que el tope de 1 es natural
      const vel = Math.tanh((this.t - this.a) / DIVISOR_VELOCIDAD);
      this.velocidad = vel * Math.abs(vel);
    }
    return this.a !== aAntes || this.velocidad !== velAntes;
  }

  // ---------- Rueda ----------

  private alRueda = (e: WheelEvent): void => {
    // Ctrl + rueda es el zoom del navegador: no se toca
    if (e.ctrlKey) return;
    e.preventDefault();
    if (this.opc.bloqueado()) return;
    const unidad = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? this.opc.alto() : 1;
    const E = (e.deltaY + e.deltaX) * unidad;
    if (E === 0) return;
    if (this.opc.reducido()) {
      this.mover(E);
      return;
    }
    const ahora = performance.now();
    const aislada = Math.abs(E) >= UMBRAL_MUESCA && ahora - this.ultimoEvento >= SILENCIO_MUESCA_MS;
    this.ultimoEvento = ahora;
    if (aislada) this.reserva += E * GANANCIA_RUEDA * FACTOR_MUESCA;
    else this.pendiente += E * GANANCIA_RUEDA;
  };

  // ---------- Teclado ----------

  private alTecla = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.opc.bloqueado()) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.mover(PASO_FLECHA, false);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this.mover(-PASO_FLECHA, false);
        break;
      case 'PageDown':
        e.preventDefault();
        this.mover(PASO_PAGINA * this.opc.alto(), false);
        break;
      case 'PageUp':
        e.preventDefault();
        this.mover(-PASO_PAGINA * this.opc.alto(), false);
        break;
      case ' ':
        e.preventDefault();
        this.mover((e.shiftKey ? -1 : 1) * PASO_PAGINA * this.opc.alto(), false);
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.opc.vecina(1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        this.opc.vecina(-1);
        break;
      default:
        break;
    }
  };

  // ---------- Arrastre con mouse ----------

  private alPunteroAbajo = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || this.opc.bloqueado()) return;
    this.bloqueaClic = false;
    this.arrastre = { x0: e.clientX, y0: e.clientY, xUlt: e.clientX, yUlt: e.clientY, tUlt: performance.now(), ultimoDelta: 0, activo: false };
  };

  private alPunteroMover = (e: PointerEvent): void => {
    const s = this.arrastre;
    if (!s || e.pointerType !== 'mouse') return;
    const ahora = performance.now();
    if (!s.activo) {
      const dx = e.clientX - s.x0;
      const dy = e.clientY - s.y0;
      // El umbral se mide en el eje dominante
      if (Math.max(Math.abs(dx), Math.abs(dy)) < UMBRAL_ARRASTRE) return;
      s.activo = true;
      this.bloqueaClic = true;
      this.opc.alCambiarArrastre(true);
      // Lo recorrido hasta cruzar el umbral cuenta completo
      s.xUlt = s.x0;
      s.yUlt = s.y0;
    }
    const dx = e.clientX - s.xUlt;
    const dy = e.clientY - s.yUlt;
    const delta = -(Math.abs(dx) >= Math.abs(dy) ? dx : dy) * (this.opc.reducido() ? 1 : GANANCIA_ARRASTRE);
    s.xUlt = e.clientX;
    s.yUlt = e.clientY;
    s.tUlt = ahora;
    s.ultimoDelta = delta;
    this.mover(delta);
  };

  private alPunteroArriba = (): void => {
    const s = this.arrastre;
    this.arrastre = null;
    if (!s?.activo) return;
    this.opc.alCambiarArrastre(false);
    // El clic que sigue al soltar ya se descartó; si no llegó ninguno, la marca se suelta enseguida
    window.setTimeout(() => {
      this.bloqueaClic = false;
    }, 0);
    // Lanzamiento: si se suelta a menos de 100 ms del último movimiento
    if (!this.opc.reducido() && performance.now() - s.tUlt < VENTANA_LANZAMIENTO_MS) {
      this.mover(s.ultimoDelta * LANZAMIENTO);
    }
  };

  private alClic = (e: MouseEvent): void => {
    if (!this.bloqueaClic) return;
    this.bloqueaClic = false;
    e.preventDefault();
    e.stopPropagation();
  };
}
