/**
 * «Sobre mí» con una persona (T45, K12): un bloque alto con su escenario fijo y una coreografía ligada al scroll,
 * sin ScrollTrigger (K2). El bloque publica su avance (0 a 1, tres decimales) en `data-sm-progreso` en cada cuadro y
 * ese avance mueve una línea de tiempo de GSAP en pausa (`time()`):
 *   · la entrada: el título con letras que parpadean y la estrella que gira (−210° a 0°) y crece;
 *   · la «foto» (el personaje sobre el fondo ciruela) se revela con `clip-path` inset y escala, y la cámara se acerca
 *     a él (zoom hasta ×1,4) en lugar del paneo entre dos personas de Tonami;
 *   · la línea de tinta se dibuja con `stroke-dashoffset` y sus flores se abren en orden cuando la estrella pasa;
 *   · la columna: el rol, el nombre (sube desde `yPercent 106` en su máscara), Perfil y Personalidad.
 * Con movimiento reducido todo queda en su estado final: sin coreografía y con el bloque corto.
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';
import { buscarTodos, limitar, tramo } from './util';

/** Entre qué avances se dibuja la línea (K12): arranca con la foto y termina antes de que salga el texto. */
const LINEA_DESDE = 0.04;
const LINEA_HASTA = 0.78;

export function iniciarSobre(c: Contexto): Modulo {
  const bloque = c.seccion.querySelector<HTMLElement>('[data-sm-bloque="sobre-mi"]');
  if (!bloque) return { destruir: () => undefined };
  const q = (selector: string): Element[] => buscarTodos(bloque, selector, Element);

  const foto = q('[data-sm="sobre-foto"]');
  const camara = q('[data-sm-camara]');
  const atenuacion = q('[data-sm-atenuacion]');
  const intro = q('.sm-s-intro');
  const letras = buscarTodos(bloque, '[data-sm-parpadeo]', HTMLElement);
  const estrellaIntro = q('.sm-s-intro-estrella');
  const rol = q('[data-sm-s="rol"]');
  const nombre = q('[data-sm="sobre-nombre"]');
  const apellido = q('[data-sm-s="apellido"]');
  const perfil = q('[data-sm="sobre-perfil"]');
  const personalidad = q('[data-sm="sobre-personalidad"]');
  const linea = bloque.querySelector<SVGPathElement>('[data-sm="sobre-linea"]');
  const estrella = bloque.querySelector<SVGGElement>('[data-sm="sobre-estrella"]');
  const flores = Array.from(bloque.querySelectorAll<SVGGElement>('[data-sm-flor]'));

  let tope = 0;
  let alto = 0;
  let largoLinea = 0;
  let tl: gsap.core.Timeline | null = null;
  let ultimo = Number.NaN;

  /** El avance del bloque: 0 cuando su escenario queda fijo y 1 cuando va a soltarse. */
  const avance = (y: number, v: number): number => limitar((y - tope) / Math.max(1, alto - v), 0, 1);

  const construir = (): void => {
    tl?.kill();
    gsap.set([...foto, ...camara, ...atenuacion, ...intro, ...estrellaIntro, ...rol, ...nombre, ...apellido, ...perfil, ...personalidad], { clearProps: 'transform,opacity,clipPath,visibility' });
    const t = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    // Los tiempos son fracciones del avance del bloque (4,5 pantallas fijas): entra rápido, como pide la ficha (K12).
    t.fromTo(estrellaIntro, { rotation: -210, scale: 0.3, transformOrigin: '50% 50%' }, { rotation: 0, scale: 1, duration: 0.05, ease: 'power2.out' }, 0);
    t.fromTo(foto, { clipPath: 'inset(34% 36% 34% 36%)', scale: 1.08 }, { clipPath: 'inset(0% 0% 0% 0%)', scale: 1, duration: 0.09, ease: 'power2.out' }, 0.03);
    t.to(intro, { opacity: 0, yPercent: -6, duration: 0.04 }, 0.1);
    t.fromTo(camara, { scale: 1 }, { scale: 1.4, duration: 0.6, ease: 'power1.inOut' }, 0.12);
    t.fromTo(atenuacion, { opacity: 0 }, { opacity: 1, duration: 0.04 }, 0.11);
    t.fromTo(rol, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.03, ease: 'power2.out' }, 0.1);
    t.fromTo(nombre, { yPercent: 106 }, { yPercent: 0, duration: 0.04, ease: 'power2.out' }, 0.11);
    t.fromTo(apellido, { yPercent: 106 }, { yPercent: 0, duration: 0.04, ease: 'power2.out' }, 0.13);
    t.fromTo(perfil, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.05, ease: 'power2.out' }, 0.15);
    t.fromTo(personalidad, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.05, ease: 'power2.out' }, 0.2);
    // Todo sale hacia arriba antes de entregar el escenario al puente.
    t.to([...rol, ...nombre.map((n) => n.parentElement ?? n), ...apellido.map((n) => n.parentElement ?? n), ...perfil, ...personalidad], { opacity: 0, yPercent: -14, duration: 0.08, ease: 'power1.in' }, 0.88);
    // La línea de tiempo dura exactamente 1: su tiempo es el avance del bloque.
    t.set({}, {}, 1);
    tl = t;
  };

  const medir = (): void => {
    const r = bloque.getBoundingClientRect();
    tope = r.top + window.scrollY;
    alto = r.height;
    if (linea) {
      largoLinea = linea.getTotalLength();
      linea.style.strokeDasharray = `${largoLinea}`;
      // Las flores van a las fracciones del recorrido: se ponen donde pasa la línea.
      for (const f of flores) {
        const fraccion = Number(f.dataset.smFraccion ?? 0);
        const p = linea.getPointAtLength(fraccion * largoLinea);
        f.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`);
      }
    }
    if (!c.reducido) construir();
    ultimo = Number.NaN;
  };

  const reducidoFinal = (): void => {
    for (const f of flores) f.setAttribute('data-abierta', 'true');
    if (linea) linea.style.strokeDasharray = 'none';
    if (estrella) estrella.style.display = 'none';
    bloque.setAttribute('data-sm-progreso', '1.000');
  };

  const dibujarLinea = (p: number): void => {
    if (!linea || largoLinea === 0) return;
    const lp = tramo(LINEA_DESDE, LINEA_HASTA, p);
    linea.style.strokeDashoffset = `${(largoLinea * (1 - lp)).toFixed(2)}`;
    // La estrella va en la cabeza de la línea, y gira (K12).
    if (estrella) {
      const punto = linea.getPointAtLength(lp * largoLinea);
      estrella.setAttribute('transform', `translate(${punto.x.toFixed(1)} ${punto.y.toFixed(1)}) rotate(${(lp * 520).toFixed(1)})`);
      estrella.style.opacity = lp > 0 && lp < 1 ? '1' : '0';
    }
    // Las flores se abren en orden cuando la estrella pasa (K12), y se cierran si se vuelve atrás.
    for (const f of flores) {
      const fraccion = Number(f.dataset.smFraccion ?? 0);
      const abierta = lp >= fraccion && lp > 0;
      const valor = abierta ? 'true' : 'false';
      if (f.getAttribute('data-abierta') !== valor) f.setAttribute('data-abierta', valor);
    }
  };

  const parpadear = (p: number): void => {
    // Las letras del título parpadean con senos pseudoaleatorios hasta que la foto empieza a revelarse (K12).
    const fin = tramo(0.02, 0.05, p);
    letras.forEach((letra, i) => {
      const seno = Math.abs(Math.sin(p * 90 + i * 2.3) * Math.cos(p * 41 + i * 1.1));
      const parpadeo = limitar(0.2 + 0.8 * seno, 0, 1);
      letra.style.opacity = `${(parpadeo + (1 - parpadeo) * fin).toFixed(3)}`;
    });
  };

  if (c.reducido) reducidoFinal();

  const actualizar = (ctx: Contexto): void => {
    if (ctx.reducido) return;
    const p = avance(ctx.y, ctx.alto);
    const texto = p.toFixed(3);
    if (bloque.getAttribute('data-sm-progreso') !== texto) bloque.setAttribute('data-sm-progreso', texto);
    if (p === ultimo || !tl) return;
    ultimo = p;
    tl.time(p);
    parpadear(p);
    dibujarLinea(p);
  };

  return {
    medir,
    actualizar,
    destruir: () => {
      tl?.kill();
    },
  };
}
