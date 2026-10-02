/**
 * El anillo de progreso de Landberg (K6): 2,5 rem de diámetro, pista de 2 px y un arco de 2 px desde las
 * 12 h en sentido horario, proporcional al avance del caso (`pos / c_{N−1}`).
 */
import gsap from 'gsap';
import { ro } from '@/lib/n3/curva-ro';

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
