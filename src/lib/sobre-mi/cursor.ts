/**
 * El cursor (T45, K10): con ratón (`any-hover: hover`) y sin movimiento reducido, en la portada y en la escena
 * invertida el movimiento estampa sellos (`[data-sm-sello]`) que se desvanecen; un clic en cualquier parte de la
 * sección suelta 8 chispas en abanico (`[data-sm-chispa]`). Los sellos y las chispas son decorativos (`aria-hidden`)
 * y salen del DOM al terminar. No se estampa sobre los campos ni sobre los diálogos.
 *
 * Estela de día: paso de 20 px, jitter de 16 px, giro de ±24° y hasta 8 sellos por movimiento; de noche, paso de
 * 30 px y sin giro; en el «gracias», palabras («¡Gracias!», «¡Listo!»…) con paso de 90 px.
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';

const SVG = 'http://www.w3.org/2000/svg';

/** K10: de día. */
const PASO_DIA = 20;
const JITTER_DIA = 16;
const GIRO_DIA = 24;
/** K10: de noche. */
const PASO_NOCHE = 30;
const JITTER_NOCHE = 14;
/** K10: en el estado de gracias. */
const PASO_GRACIAS = 90;
const JITTER_GRACIAS = 12;
const GIRO_GRACIAS = 8;
/** K10: tope de sellos por movimiento. */
const MAXIMO_POR_MOVIMIENTO = 8;
/** Cuántos sellos viven a la vez como máximo (los más viejos se quitan). */
const MAXIMO_VIVOS = 64;
/** K10: la estrella del clic. */
const CHISPAS = 8;
const DISTANCIAS_CHISPA = [34, 40, 46] as const;
const TAMANOS_CHISPA = [7, 9, 11, 13] as const;
const GIROS_CHISPA = [90, 120, 150] as const;

type Sello = 'estrella' | 'circulo' | 'punto' | 'brillo' | 'aro';
const SECUENCIA_DIA: readonly Sello[] = ['estrella', 'circulo', 'estrella', 'circulo', 'estrella'];
const SECUENCIA_NOCHE: readonly Sello[] = ['punto', 'brillo', 'aro', 'punto', 'brillo'];

function dibujo(tipo: Sello, lado: number): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '-50 -50 100 100');
  svg.setAttribute('width', `${lado}`);
  svg.setAttribute('height', `${lado}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.display = 'block';
  svg.style.overflow = 'visible';
  const forma = (nombre: string, atributos: Record<string, string>): void => {
    const el = document.createElementNS(SVG, nombre);
    for (const [k, v] of Object.entries(atributos)) el.setAttribute(k, v);
    svg.appendChild(el);
  };
  const estrella = 'M0 -48C3 -14 14 0 48 0C14 3 3 14 0 48C-3 14 -14 3 -48 0C-14 -3 -3 -14 0 -48Z';
  switch (tipo) {
    case 'estrella':
    case 'brillo':
      forma('path', { d: estrella, fill: tipo === 'estrella' ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': '4' });
      break;
    case 'circulo':
    case 'punto':
      forma('circle', { cx: '0', cy: '0', r: tipo === 'circulo' ? '30' : '14', fill: 'currentColor' });
      break;
    case 'aro':
      forma('circle', { cx: '0', cy: '0', r: '34', fill: 'none', stroke: 'currentColor', 'stroke-width': '6' });
      break;
  }
  return svg;
}

export function iniciarCursor(c: Contexto): Modulo {
  if (!c.ratonFino) return { destruir: () => undefined };
  const capa = c.seccion.querySelector<HTMLElement>('[data-sm-estela]');
  if (!capa) return { destruir: () => undefined };
  const abort = new AbortController();
  const { signal } = abort;

  let ultimoX = Number.NaN;
  let ultimoY = Number.NaN;
  let acumulado = 0;
  let indice = 0;
  let portadaTope = 0;
  let portadaAlto = 0;
  const vivos: HTMLElement[] = [];

  const portada = c.seccion.querySelector<HTMLElement>('[data-sm-bloque="portada"]');
  const gracias = (): boolean => c.seccion.querySelector('form[data-sm-formulario]')?.getAttribute('data-estado') === 'enviado';

  const quitar = (el: HTMLElement): void => {
    gsap.killTweensOf(el);
    el.remove();
    const i = vivos.indexOf(el);
    if (i >= 0) vivos.splice(i, 1);
  };

  const estampar = (x: number, y: number): void => {
    const palabras = gracias();
    const noche = c.tema() === 'noche';
    const jitter = palabras ? JITTER_GRACIAS : noche ? JITTER_NOCHE : JITTER_DIA;
    const giro = palabras ? GIRO_GRACIAS : noche ? 0 : GIRO_DIA;
    const el = document.createElement('span');
    el.setAttribute('data-sm-sello', '');
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;color:var(--sm-escena-tinta, var(--sm-primario));line-height:1;white-space:nowrap';
    if (palabras) {
      const lista = c.config.formulario.palabras;
      el.textContent = lista[indice % Math.max(1, lista.length)] ?? '';
      el.style.fontFamily = 'var(--fuente-display)';
      el.style.fontWeight = '800';
      el.style.fontSize = 'var(--sm-letra-md)';
    } else {
      const secuencia = noche ? SECUENCIA_NOCHE : SECUENCIA_DIA;
      const tamano = 14 + ((indice * 7) % 4) * 6;
      el.appendChild(dibujo(secuencia[indice % secuencia.length], tamano));
    }
    indice++;
    const dx = (Math.random() * 2 - 1) * jitter;
    const dy = (Math.random() * 2 - 1) * jitter;
    const rotacion = (Math.random() * 2 - 1) * giro;
    capa.appendChild(el);
    vivos.push(el);
    if (vivos.length > MAXIMO_VIVOS) quitar(vivos[0]);
    gsap.set(el, { x: x + dx, y: y + dy, xPercent: -50, yPercent: -50, rotation: rotacion, scale: 0, opacity: 1 });
    gsap
      .timeline({ onComplete: () => quitar(el) })
      .to(el, { scale: 1, duration: 0.22, ease: 'back.out(1.7)' })
      .to(el, { opacity: 0, scale: 0.7, duration: 0.8, ease: 'power1.in' }, 0.3);
  };

  /** ¿El ratón está en la portada o en la escena invertida? Ahí se estampa (data-cursor-trail de Tonami). */
  const enZona = (objetivo: EventTarget | null): boolean => {
    if (c.seccion.getAttribute('data-sm-invertida') === 'true') return true;
    // E3 de la auditoría final: después de enviar, la estela de palabras sale en el contacto, donde se dio el gracias.
    if (gracias() && objetivo instanceof Element && objetivo.closest('[data-sm="contacto"]')) return true;
    const mitad = window.scrollY + window.innerHeight * 0.5;
    return mitad >= portadaTope && mitad <= portadaTope + portadaAlto;
  };

  const alMover = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || c.nivel() !== 'SM') return;
    const objetivo = e.target;
    const bloqueado = objetivo instanceof Element && objetivo.closest('input, textarea, select, dialog, button, a') !== null;
    if (Number.isNaN(ultimoX)) {
      ultimoX = e.clientX;
      ultimoY = e.clientY;
      return;
    }
    const dx = e.clientX - ultimoX;
    const dy = e.clientY - ultimoY;
    const distancia = Math.hypot(dx, dy);
    const sx = ultimoX;
    const sy = ultimoY;
    ultimoX = e.clientX;
    ultimoY = e.clientY;
    if (bloqueado || !enZona(objetivo) || document.querySelector('dialog[open]')) {
      acumulado = 0;
      return;
    }
    const paso = gracias() ? PASO_GRACIAS : c.tema() === 'noche' ? PASO_NOCHE : e.buttons ? PASO_DIA / 2 : PASO_DIA;
    acumulado += distancia;
    let puestos = 0;
    // Un sello cada `paso` px del recorrido, repartidos sobre el movimiento (máx. 8 por movimiento).
    while (acumulado >= paso && puestos < MAXIMO_POR_MOVIMIENTO) {
      acumulado -= paso;
      const t = distancia === 0 ? 1 : Math.min(1, 1 - acumulado / distancia);
      estampar(sx + dx * t, sy + dy * t);
      puestos++;
    }
    if (puestos === MAXIMO_POR_MOVIMIENTO) acumulado = 0;
  };

  const chispas = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' || e.button !== 0 || c.nivel() !== 'SM') return;
    const objetivo = e.target;
    if (objetivo instanceof Element && objetivo.closest('dialog')) return;
    for (let i = 0; i < CHISPAS; i++) {
      const angulo = ((22.5 + 45 * i) * Math.PI) / 180;
      const distancia = DISTANCIAS_CHISPA[i % DISTANCIAS_CHISPA.length];
      const lado = TAMANOS_CHISPA[i % TAMANOS_CHISPA.length];
      const giro = (i % 2 === 0 ? 1 : -1) * GIROS_CHISPA[i % GIROS_CHISPA.length];
      const el = document.createElement('span');
      el.setAttribute('data-sm-chispa', '');
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;color:var(--sm-escena-tinta, var(--sm-primario));line-height:1';
      el.appendChild(dibujo('estrella', lado));
      capa.appendChild(el);
      gsap.set(el, { x: e.clientX + Math.cos(angulo) * 10, y: e.clientY + Math.sin(angulo) * 10, xPercent: -50, yPercent: -50, scale: 0, rotation: 0, opacity: 1 });
      gsap
        .timeline({ onComplete: () => el.remove() })
        .to(el, { x: e.clientX + Math.cos(angulo) * distancia, y: e.clientY + Math.sin(angulo) * distancia, scale: 1, rotation: giro, duration: 0.5, ease: 'expo.out' })
        .to(el, { opacity: 0, scale: 0.4, duration: 0.4, ease: 'power1.in' }, 0.4);
    }
  };

  window.addEventListener('pointermove', alMover, { passive: true, signal });
  window.addEventListener('pointerdown', chispas, { passive: true, signal });

  return {
    medir: () => {
      if (!portada) return;
      const r = portada.getBoundingClientRect();
      portadaTope = r.top + window.scrollY;
      portadaAlto = r.height;
    },
    destruir: () => {
      abort.abort();
      for (const el of [...vivos]) quitar(el);
      capa.replaceChildren();
    },
  };
}
