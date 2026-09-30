/**
 * La pista DOM del N3: una fila de tarjetas en bucle cuya posición vive en el `transform` de cada
 * una (K1, K2, K9). Su rectángulo es la fuente de la pose del plano en WebGL, así el DOM y el
 * dibujo no pueden separarse; y como son elementos de verdad se pueden enfocar y abrir con teclado.
 *
 * El layout se mide una vez (al montar y al redimensionar) y las posiciones se calculan: nada se
 * lee del DOM en cada cuadro, y solo se escribe una tarjeta cuando su posición cambió.
 */

export interface RectTarjeta {
  izq: number;
  arriba: number;
  ancho: number;
  alto: number;
}

export class Pista {
  readonly tarjetas: HTMLElement[];
  /** Rectángulo actual de cada tarjeta (px CSS de la ventana), ya envuelto en el bucle. */
  readonly rects: RectTarjeta[];

  private anchos: number[] = [];
  private altos: number[] = [];
  private inicios: number[] = [];
  private largo = 1;
  private ventanaAncho = 1;
  private ventanaAlto = 1;
  private remPx = 16;
  private escritas: string[];

  constructor(
    private readonly contenedor: HTMLElement,
    tarjetas: HTMLElement[],
  ) {
    this.tarjetas = tarjetas;
    this.rects = tarjetas.map(() => ({ izq: 0, arriba: 0, ancho: 0, alto: 0 }));
    this.escritas = tarjetas.map(() => '');
  }

  get rem(): number {
    return this.remPx;
  }

  get ancho(): number {
    return this.ventanaAncho;
  }

  get alto(): number {
    return this.ventanaAlto;
  }

  /** Largo del bucle (px): lo que hay que avanzar para volver a la misma disposición. */
  get largoBucle(): number {
    return this.largo;
  }

  /** Mide tamaños y ranuras. Se llama al montar, al redimensionar y cuando cargan las portadas. */
  medir(): void {
    this.ventanaAncho = this.contenedor.clientWidth || window.innerWidth;
    this.ventanaAlto = this.contenedor.clientHeight || window.innerHeight;
    // En el N3 el `font-size` de la sección vale 1 rem (= 0,667 vw)
    const padre = this.contenedor.parentElement ?? this.contenedor;
    this.remPx = parseFloat(getComputedStyle(padre).fontSize) || 16;
    const hueco = this.remPx;
    this.anchos = [];
    this.altos = [];
    this.inicios = [];
    let acumulado = 0;
    for (const el of this.tarjetas) {
      const caja = el.getBoundingClientRect();
      this.anchos.push(caja.width);
      this.altos.push(caja.height);
      this.inicios.push(acumulado);
      acumulado += caja.width + hueco;
    }
    this.largo = Math.max(1, acumulado);
    this.escritas = this.tarjetas.map(() => '');
  }

  /** Posición izquierda envuelta de la tarjeta i para un desplazamiento `a`. */
  private izquierda(i: number, a: number): number {
    // El rango de envoltura está centrado en la ventana: lo que cae fuera de ±0,5 ventanas es invisible
    const minimo = this.ventanaAncho / 2 - this.largo / 2;
    const v = this.inicios[i] - a;
    return minimo + ((((v - minimo) % this.largo) + this.largo) % this.largo);
  }

  /** Escribe las posiciones para `a`. Devuelve true si alguna tarjeta cambió de sitio. */
  aplicar(a: number): boolean {
    let cambio = false;
    for (let i = 0; i < this.tarjetas.length; i++) {
      const izq = this.izquierda(i, a);
      const rect = this.rects[i];
      rect.izq = izq;
      rect.ancho = this.anchos[i];
      rect.alto = this.altos[i];
      rect.arriba = (this.ventanaAlto - this.altos[i]) / 2;
      const valor = `translate3d(${izq.toFixed(2)}px, -50%, 0)`;
      if (valor !== this.escritas[i]) {
        this.escritas[i] = valor;
        this.tarjetas[i].style.transform = valor;
        cambio = true;
      }
    }
    return cambio;
  }

  /** Desplazamiento que deja la tarjeta i centrada, por el camino corto del bucle desde `t`. */
  paraCentrar(i: number, t: number): number {
    const centrada = this.inicios[i] + this.anchos[i] / 2 - this.ventanaAncho / 2;
    const delta = centrada - t;
    return t + delta - this.largo * Math.round(delta / this.largo);
  }

  /** Desplazamiento que deja la tarjeta i centrada sin envolver (para el montaje inicial). */
  centradaExacta(i: number): number {
    return this.inicios[i] + this.anchos[i] / 2 - this.ventanaAncho / 2;
  }

  /** Desplazamiento que centra la tarjeta vecina en la dirección dada, vista desde `t`. */
  paraVecina(direccion: 1 | -1, t: number): number {
    let mejor: number | null = null;
    for (let i = 0; i < this.tarjetas.length; i++) {
      const centro = this.izquierda(i, t) + this.anchos[i] / 2 - this.ventanaAncho / 2;
      if (direccion === 1 && centro > 1 && (mejor === null || centro < mejor)) mejor = centro;
      if (direccion === -1 && centro < -1 && (mejor === null || centro > mejor)) mejor = centro;
    }
    return mejor === null ? t : t + mejor;
  }

  /** La tarjeta más cercana al centro de la ventana y cuánto se aparta de él, en fracciones de su ancho. */
  ancla(): { indice: number; fraccion: number } {
    let mejor = 0;
    let distancia = Infinity;
    for (let i = 0; i < this.rects.length; i++) {
      const d = this.rects[i].izq + this.rects[i].ancho / 2 - this.ventanaAncho / 2;
      if (Math.abs(d) < Math.abs(distancia)) {
        distancia = d;
        mejor = i;
      }
    }
    return { indice: mejor, fraccion: this.rects[mejor].ancho > 0 ? distancia / this.rects[mejor].ancho : 0 };
  }

  /** Desplazamiento que reproduce un ancla (tarjeta y fracción) con las medidas actuales. */
  paraAncla(indice: number, fraccion: number): number {
    return this.centradaExacta(indice) - fraccion * this.anchos[indice];
  }

  /** Índice de la tarjeta bajo un punto de la ventana, o -1. */
  bajo(x: number, y: number): number {
    for (let i = 0; i < this.rects.length; i++) {
      const r = this.rects[i];
      if (x >= r.izq && x <= r.izq + r.ancho && y >= r.arriba && y <= r.arriba + r.alto) return i;
    }
    return -1;
  }
}
