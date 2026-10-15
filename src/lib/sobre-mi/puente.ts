/**
 * El puente hacia la historia (T45, K12 y A10): la línea se vuelve un resorte, la estrella cae y las palabras se
 * dispersan; la estrella termina como un aro y entrega a la historia. Es un bloque alto con su escenario fijo; su
 * avance sale de dónde está el bloque en la pantalla (0 cuando entra por abajo, 1 cuando va a soltarse) y mueve una
 * línea de tiempo en pausa, como `sobre.ts`. Con movimiento reducido las palabras y el resorte ya están en su sitio.
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';
import { buscarTodos, limitar } from './util';

export function iniciarPuente(c: Contexto): Modulo {
  const bloque = c.seccion.querySelector<HTMLElement>('[data-sm="puente"]');
  if (!bloque) return { destruir: () => undefined };
  const linea = bloque.querySelector<SVGPathElement>('[data-sm-pu="linea"]');
  const resorte = bloque.querySelector<SVGPathElement>('[data-sm-pu="resorte"]');
  const aro = bloque.querySelector<SVGCircleElement>('[data-sm-pu="aro"]');
  const estrella = bloque.querySelector<SVGGElement>('[data-sm-pu="estrella"]');
  const palabras = buscarTodos(bloque, '[data-sm-pu="palabra"] .sm-pu-palabra-texto', HTMLElement);

  let tope = 0;
  let alto = 0;
  let tl: gsap.core.Timeline | null = null;
  let ultimo = Number.NaN;

  const construir = (): void => {
    tl?.kill();
    const largoLinea = linea?.getTotalLength() ?? 0;
    const largoResorte = resorte?.getTotalLength() ?? 0;
    const largoAro = aro?.getTotalLength() ?? 0;
    const t = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    if (linea) {
      linea.style.strokeDasharray = `${largoLinea}`;
      t.fromTo(linea, { strokeDashoffset: largoLinea }, { strokeDashoffset: 0, duration: 0.1 }, 0);
      t.to(linea, { opacity: 0, duration: 0.1 }, 0.58);
    }
    if (resorte) {
      resorte.style.strokeDasharray = `${largoResorte}`;
      t.fromTo(resorte, { strokeDashoffset: largoResorte }, { strokeDashoffset: 0, duration: 0.2 }, 0.1);
      t.to(resorte, { opacity: 0, duration: 0.1 }, 0.58);
    }
    if (estrella) {
      // La estrella cae por el eje del escenario mientras el resorte se forma, y gira.
      t.fromTo(estrella, { x: 720, y: 250, rotation: 0, scale: 1, transformOrigin: '50% 50%' }, { y: 720, rotation: 540, duration: 0.3, ease: 'power1.inOut' }, 0.1);
      t.to(estrella, { scale: 0, duration: 0.08, ease: 'power2.in' }, 0.62);
    }
    if (aro) {
      aro.style.strokeDasharray = `${largoAro}`;
      t.fromTo(aro, { strokeDashoffset: largoAro }, { strokeDashoffset: 0, duration: 0.14, ease: 'power2.out' }, 0.64);
    }
    t.fromTo(
      palabras,
      { yPercent: 115, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.08, ease: 'power2.out', stagger: 0.04 },
      0.14,
    );
    t.set({}, {}, 1);
    tl = t;
  };

  const medir = (): void => {
    const r = bloque.getBoundingClientRect();
    tope = r.top + window.scrollY;
    alto = r.height;
    if (!c.reducido) construir();
    ultimo = Number.NaN;
  };

  const actualizar = (ctx: Contexto): void => {
    if (ctx.reducido || !tl) return;
    // 0 cuando el borde de arriba del bloque entra por abajo de la pantalla; 1 cuando el escenario va a soltarse.
    const p = limitar((ctx.y + ctx.alto - tope) / Math.max(1, alto), 0, 1);
    if (p === ultimo) return;
    ultimo = p;
    tl.time(p);
  };

  return {
    medir,
    actualizar,
    destruir: () => {
      tl?.kill();
    },
  };
}
