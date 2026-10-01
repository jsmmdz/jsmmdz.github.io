/**
 * El vuelo de la pieza al caso (K16, con los ajustes del autor del 2026-10-01).
 *
 * La tarjeta clicada arranca desde donde esté (con su deformación del momento) y llega al medio del
 * caso N4 en 1,0 s con la curva «ro». El progreso `p = ro(v)` interpola posición y escala; la
 * deformación, la luz y la esquina bajan con él. Este módulo solo lleva el reloj y la geometría del
 * vuelo; quien dibuja (mundo.ts) lee `p` y `rect()` en cada cuadro.
 */
import gsap from 'gsap';
import { ro } from '@/lib/n3/curva-ro';
import type { RectTarjeta } from '@/lib/n3/pista';

/** Duración del vuelo: la del código de Landberg, 1,0 s (autor, 2026-10-01; antes 0,7 s). */
export const DURACION_VUELO = 1.0;

export class Vuelo {
  /** Tiempo normalizado 0..1 y progreso con la curva «ro». */
  private estado = { v: 0 };
  p = 0;
  terminado = false;
  private tween: gsap.core.Tween | null = null;

  constructor(
    readonly indice: number,
    /** Rectángulo de la tarjeta al hacer clic (px CSS de la ventana), ya con el bucle aplicado. */
    private readonly origen: RectTarjeta,
    /** Rectángulo del medio del caso N4 (px CSS). */
    private readonly destino: RectTarjeta,
    /** Velocidad de la cinta al hacer clic: la deformación del momento se congela con ella. */
    readonly velocidad0: number,
  ) {}

  iniciar(alActualizar: () => void): void {
    this.tween = gsap.to(this.estado, {
      v: 1,
      duration: DURACION_VUELO,
      ease: 'none',
      onUpdate: () => {
        this.p = ro(this.estado.v);
        alActualizar();
      },
      onComplete: () => {
        this.p = 1;
        this.terminado = true;
        alActualizar();
      },
    });
  }

  /** Rectángulo actual: interpolación lineal entre el origen y el medio del caso con `p`. */
  rect(): RectTarjeta {
    const { origen: o, destino: d, p } = this;
    return {
      izq: o.izq + (d.izq - o.izq) * p,
      arriba: o.arriba + (d.arriba - o.arriba) * p,
      ancho: o.ancho + (d.ancho - o.ancho) * p,
      alto: o.alto + (d.alto - o.alto) * p,
    };
  }

  cancelar(): void {
    this.tween?.kill();
    this.tween = null;
  }
}
