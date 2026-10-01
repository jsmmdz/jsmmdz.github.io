/**
 * La regla de capítulos de Zero (ZK8) y el anillo de progreso de Landberg (K6).
 *
 * La regla: un `nav` de 300 × 60 px arriba al centro con una pista de marcas finas (una cada 0,1
 * alturas de ventana de scroll; las de capítulo, más altas) que se traslada para que la posición actual
 * quede bajo una aguja central. Los rótulos son botones que saltan al capítulo. El marcado lo pone
 * Astro; aquí solo se mueve y se habilita. Con foco por teclado, la pista se traslada para dejar el
 * rótulo enfocado bajo la aguja (así su contorno cae dentro de la ventana y fuera del borde atenuado);
 * al perder el foco vuelve a la posición del scroll.
 *
 * El anillo: 2,5 rem de diámetro, pista de 2 px y un arco de 2 px desde las 12 h en sentido horario,
 * proporcional al avance del caso.
 */
import gsap from 'gsap';
import { ro } from '@/lib/n3/curva-ro';
import { PX_POR_ALTO, PX_POR_CAPITULO } from './capitulos';

/** Ancho de la regla (px) y su centro, donde está la aguja. */
const ANCHO_REGLA = 300;
export class Regla {
  private readonly pista: HTMLElement;
  private readonly rotulos: HTMLButtonElement[];
  private ultimo = '';
  /** Rótulo con el foco por teclado: la pista se traslada para dejarlo bajo la aguja (no cambia el scroll). */
  private foco: number | null = null;
  /** Última posición y alto de ventana recibidos: con ellos se reaplica la pista al ganar o perder el foco. */
  private pos = 0;
  private alto = 1;

  constructor(
    nav: HTMLElement,
    private readonly alElegir: (k: number) => void,
    signal: AbortSignal,
  ) {
    const pista = nav.querySelector<HTMLElement>('[data-n4-regla-pista]');
    if (!pista) throw new Error('la regla no tiene pista');
    this.pista = pista;
    this.rotulos = Array.from(nav.querySelectorAll<HTMLButtonElement>('button[data-n4-rotulo]'));
    this.rotulos.forEach((b, k) => {
      b.addEventListener(
        'click',
        () => {
          this.foco = null;
          this.alElegir(k);
        },
        { signal },
      );
      // Con el foco la pista se traslada en ese mismo momento; al soltarlo vuelve a la posición del scroll
      b.addEventListener(
        'focus',
        () => {
          this.foco = k;
          this.actualizar(this.pos, this.alto);
        },
        { signal },
      );
      b.addEventListener(
        'blur',
        () => {
          this.foco = null;
          this.actualizar(this.pos, this.alto);
        },
        { signal },
      );
    });
  }

  /** Traslada la pista: la posición `pos` (px virtuales) queda bajo la aguja. Solo escribe si cambió. */
  actualizar(pos: number, altoVentana: number): void {
    this.pos = pos;
    this.alto = altoVentana;
    const centro = this.foco !== null ? this.foco * PX_POR_CAPITULO : (pos / Math.max(1, altoVentana)) * PX_POR_ALTO;
    const valor = `translate3d(${(ANCHO_REGLA / 2 - centro).toFixed(1)}px, 0, 0)`;
    if (valor === this.ultimo) return;
    this.ultimo = valor;
    this.pista.style.transform = valor;
  }

  /** Marca el rótulo del capítulo activo. */
  marcarActivo(k: number): void {
    this.rotulos.forEach((b, i) => {
      if (i === k) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
    });
  }

  /** Los rótulos no se pueden usar mientras vuela la pieza. */
  habilitar(si: boolean): void {
    for (const b of this.rotulos) b.disabled = !si;
  }
}

/** El anillo de progreso: SVG en el DOM, medido en píxeles para que el trazo mida 2 px exactos. */
export class Anillo {
  private readonly svg: SVGSVGElement;
  private readonly pista: SVGCircleElement;
  private readonly arco: SVGCircleElement;
  private circunferencia = 1;
  private ultimo = -1;
  private tween: gsap.core.Tween | null = null;

  constructor(contenedor: HTMLElement) {
    const svg = contenedor.querySelector('svg');
    const pista = contenedor.querySelector<SVGCircleElement>('[data-n4-anillo-pista]');
    const arco = contenedor.querySelector<SVGCircleElement>('[data-n4-anillo-arco]');
    if (!svg || !pista || !arco) throw new Error('el anillo no tiene sus círculos');
    this.svg = svg;
    this.pista = pista;
    this.arco = arco;
    this.medir();
  }

  /** Mide el diámetro real (2,5 rem) y dibuja los círculos a esa medida. Se llama al montar y al redimensionar. */
  medir(): void {
    const d = this.svg.getBoundingClientRect().width || 24;
    const trazo = parseFloat(getComputedStyle(this.arco).strokeWidth) || 2;
    const r = (d - trazo) / 2;
    this.svg.setAttribute('viewBox', `0 0 ${d} ${d}`);
    for (const c of [this.pista, this.arco]) {
      c.setAttribute('cx', String(d / 2));
      c.setAttribute('cy', String(d / 2));
      c.setAttribute('r', String(r));
      // El arco arranca a las 12 h y avanza en sentido horario
      c.setAttribute('transform', `rotate(-90 ${d / 2} ${d / 2})`);
    }
    this.circunferencia = 2 * Math.PI * r;
    this.pista.style.strokeDasharray = String(this.circunferencia);
    this.arco.style.strokeDasharray = String(this.circunferencia);
    this.ultimo = -1;
  }

  /** Dibuja el arco para un avance 0..1 (solo escribe si cambió). */
  progreso(p: number): void {
    const v = Math.round(Math.min(1, Math.max(0, p)) * 10000) / 10000;
    if (v === this.ultimo) return;
    this.ultimo = v;
    this.arco.style.strokeDashoffset = String(this.circunferencia * (1 - v));
  }

  /** Entrada: la pista se dibuja con «ro» en 0,85 s, `retraso` segundos después de ahora. */
  entrar(retraso: number, duracion: number, sinAnimar: boolean): gsap.core.Tween | null {
    this.tween?.kill();
    if (sinAnimar) {
      this.pista.style.strokeDashoffset = '0';
      return null;
    }
    const estado = { v: 0 };
    const poner = () => {
      this.pista.style.strokeDashoffset = String(this.circunferencia * (1 - ro(estado.v)));
    };
    poner();
    this.tween = gsap.to(estado, { v: 1, duration: duracion, delay: retraso, ease: 'none', onUpdate: poner, onComplete: poner });
    return this.tween;
  }

  destruir(): void {
    this.tween?.kill();
    this.tween = null;
  }
}
