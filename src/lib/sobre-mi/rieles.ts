/**
 * Los rieles laterales (T45, K7): el rótulo vertical, en español, que cambia según el bloque con más área en pantalla.
 * El cambio es una banda de color que barre el texto: entra con `clip-path` en 0,2 s (expo.out), se cambia el
 * texto y sale en 0,4 s (power2.inOut); la dirección del barrido depende de si se baja o se sube. Con movimiento
 * reducido el texto se cambia sin barrido.
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';
import type { RotuloConfig } from './config';
import { buscarTodos, topeAbsoluto } from './util';

/** K7: la banda entra en 0,2 s y sale en 0,4 s. */
const BANDA_ENTRA_S = 0.2;
const BANDA_SALE_S = 0.4;

interface Riel {
  lado: 'izquierdo' | 'derecho';
  texto: HTMLElement;
  banda: HTMLElement;
  actual: string;
  linea: gsap.core.Timeline | null;
}

interface Bloque {
  id: string;
  el: HTMLElement;
  tope: number;
  alto: number;
}

export function iniciarRieles(c: Contexto): Modulo {
  const rieles: Riel[] = [];
  for (const lado of ['izquierdo', 'derecho'] as const) {
    const rotulo = c.seccion.querySelector<HTMLElement>(`[data-sm-riel-rotulo="${lado}"]`);
    const texto = rotulo?.querySelector<HTMLElement>('[data-sm-riel-texto]');
    const banda = rotulo?.querySelector<HTMLElement>('[data-sm-riel-banda]');
    if (texto && banda) rieles.push({ lado, texto, banda, actual: texto.textContent ?? '', linea: null });
  }
  const bloques: Bloque[] = buscarTodos(c.seccion, '[data-sm-bloque]', HTMLElement).map((el) => ({
    el,
    id: el.dataset.smBloque ?? '',
    tope: 0,
    alto: 0,
  }));
  let bloqueActual = '';
  let yAnterior = c.y;

  const medir = (): void => {
    for (const b of bloques) {
      b.tope = topeAbsoluto(b.el);
      b.alto = b.el.getBoundingClientRect().height;
    }
  };

  const rotuloDe = (id: string, lado: 'izquierdo' | 'derecho'): string | null => {
    const r: RotuloConfig | undefined = c.config.rieles[id];
    return r ? r[lado] : null;
  };

  const cambiar = (riel: Riel, nuevo: string, bajando: boolean): void => {
    if (riel.actual === nuevo) return;
    riel.linea?.kill();
    riel.actual = nuevo;
    if (c.reducido) {
      riel.texto.textContent = nuevo;
      return;
    }
    // Barrido de la banda: de arriba hacia abajo si se baja, al revés si se sube.
    const entra = bajando ? 'inset(0% 0% 100% 0%)' : 'inset(100% 0% 0% 0%)';
    const cubre = 'inset(0% 0% 0% 0%)';
    const sale = bajando ? 'inset(100% 0% 0% 0%)' : 'inset(0% 0% 100% 0%)';
    const tl = gsap.timeline({
      onComplete: () => {
        gsap.set([riel.banda, riel.texto], { clearProps: 'clipPath' });
      },
    });
    tl.fromTo(riel.banda, { clipPath: entra }, { clipPath: cubre, duration: BANDA_ENTRA_S, ease: 'expo.out' });
    tl.call(() => {
      riel.texto.textContent = nuevo;
    });
    tl.to(riel.banda, { clipPath: sale, duration: BANDA_SALE_S, ease: 'power2.inOut' });
    tl.fromTo(riel.texto, { clipPath: entra }, { clipPath: cubre, duration: BANDA_SALE_S, ease: 'power2.inOut' }, '<');
    riel.linea = tl;
  };

  const actualizar = (ctx: Contexto): void => {
    if (ctx.nivel() !== 'SM') return;
    // El bloque con más área en pantalla (K7: IntersectionObserver con umbrales; aquí, la misma regla con los límites medidos).
    let mejor = '';
    let area = -1;
    for (const b of bloques) {
      const visible = Math.max(0, Math.min(b.tope + b.alto, ctx.y + ctx.alto) - Math.max(b.tope, ctx.y));
      if (visible > area) {
        area = visible;
        mejor = b.id;
      }
    }
    const bajando = ctx.y >= yAnterior;
    yAnterior = ctx.y;
    if (mejor === '' || mejor === bloqueActual) return;
    bloqueActual = mejor;
    for (const riel of rieles) {
      const nuevo = rotuloDe(mejor, riel.lado);
      if (nuevo !== null) cambiar(riel, nuevo, bajando);
    }
  };

  return {
    medir,
    actualizar,
    destruir: () => {
      for (const riel of rieles) riel.linea?.kill();
    },
  };
}
