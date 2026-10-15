/**
 * El interruptor Día / Noche cede el paso (T45, H12 y H13 del QA r2). En celular el contenido llega a 16-20 px del
 * borde y el área de toque del interruptor (T39: 44 px) no cabe en el riel sin pisarlo: al bajar por el contacto, los
 * campos, la casilla y los enlaces de la tarjeta pasan por debajo, y un toque en ellos cambiaba el tema. Además, el
 * texto que se mueve con el scroll (las palabras del puente, el paneo del cierre) pasaba bajo su dibujo.
 *
 * Con el scroll se mira:
 * - si algún control del contenido (o la tarjeta de papel) cruza lo que responde al toque (el área de T39 y el dibujo);
 * - si algún renglón de texto visible cruza el dibujo (las marcas y las palabras «Día» y «Noche»).
 * Mientras pase cualquiera de las dos, `data-sm-cede="true"` lo apaga para el toque y lo desvanece (`Marco.astro`).
 * Cuando el borde queda libre (la portada y las paradas de la historia) se toca como siempre. Con el teclado se sigue
 * alcanzando.
 */
import type { Contexto, Modulo } from './contexto';
import { buscar, buscarTodos } from './util';

/** Lo que no puede quedar bajo el área de toque: los controles del contenido y la tarjeta de papel del contacto. */
const OBSTACULOS = 'a[href], button, input, textarea, select, label, [data-sm="tarjeta"]';
/** Sin scroll, se vuelve a mirar cada tantos cuadros (por si algo se mueve solo: una entrada, un relevo). */
const CUADROS_SIN_SCROLL = 10;
/** Cuánto puede salirse un renglón de la caja de su elemento (px) en el primer filtro, el barato. */
const HOLGURA_PX = 12;

interface Caja {
  izq: number;
  der: number;
  arr: number;
  aba: number;
}

const cruzan = (a: Caja, r: DOMRect): boolean => r.right > a.izq && r.left < a.der && r.bottom > a.arr && r.top < a.aba;

const unir = (rects: Iterable<DOMRect>): Caja => {
  const z: Caja = { izq: Infinity, der: -Infinity, arr: Infinity, aba: -Infinity };
  for (const r of rects) {
    if (r.width === 0 && r.height === 0) continue;
    z.izq = Math.min(z.izq, r.left);
    z.der = Math.max(z.der, r.right);
    z.arr = Math.min(z.arr, r.top);
    z.aba = Math.max(z.aba, r.bottom);
  }
  return z;
};

const vacia = (z: Caja): boolean => !(z.izq < z.der && z.arr < z.aba);

/**
 * Los rectángulos de cada renglón del texto propio de un elemento (no su caja, que puede ser más ancha). Se leen los
 * nodos de texto de ahora: las coreografías cambian el texto con `textContent`, que reemplaza el nodo.
 */
function renglones(rango: Range, el: HTMLElement): DOMRect[] {
  const out: DOMRect[] = [];
  for (const n of el.childNodes) {
    if (!(n instanceof Text) || !(n.textContent ?? '').trim()) continue;
    rango.selectNodeContents(n);
    out.push(...rango.getClientRects());
  }
  return out;
}

const visible = (el: HTMLElement): boolean =>
  typeof el.checkVisibility === 'function'
    ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
    : getComputedStyle(el).visibility !== 'hidden';

export function iniciarInterruptor(c: Contexto): Modulo {
  const boton = buscar(c.seccion, 'button[data-sm-interruptor]', HTMLButtonElement);
  if (!boton) return { destruir: () => undefined };
  // Lo que responde al toque: el botón, su área de T39 y sus opciones (que pueden salirse de la caja del botón).
  const partes = [boton, ...buscarTodos(boton, '*', HTMLElement)];
  const marcas = buscarTodos(boton, '.sm-interruptor-marca', HTMLElement);
  const palabras = textosDe(boton);
  const rango = document.createRange();
  let obstaculos: HTMLElement[] = [];
  let textos: HTMLElement[] = [];
  let yAnterior = Number.NaN;
  let cuadros = 0;
  let otraVez = false;
  let cede = false;

  /** El dibujo: las marcas y los renglones de «Día» y «Noche». */
  const dibujo = (): DOMRect[] => [
    ...marcas.map((m) => m.getBoundingClientRect()),
    ...palabras.flatMap((el) => renglones(rango, el)),
  ];

  const tapaUnControl = (zona: Caja): boolean =>
    obstaculos.some((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && cruzan(zona, r) && visible(el);
    });

  const tapaUnTexto = (trazos: DOMRect[]): boolean => {
    const dib = unir(trazos);
    if (vacia(dib)) return false;
    // El renglón puede salirse de la caja de su elemento (una línea más alta que la caja): se compara con holgura.
    const caja: Caja = { izq: dib.izq - HOLGURA_PX, der: dib.der + HOLGURA_PX, arr: dib.arr - HOLGURA_PX, aba: dib.aba + HOLGURA_PX };
    return textos.some((el) => {
      const r = el.getBoundingClientRect();
      // Primero la caja del elemento (barato); solo si cruza, los renglones de verdad. El texto solo para lectores
      // (caja de 1 px) no se ve.
      if (r.width <= 1 || r.height <= 1 || !cruzan(caja, r) || !visible(el)) return false;
      return renglones(rango, el).some(
        (l) => l.width >= 1 && l.height >= 1 && trazos.some((d) => cruzan({ izq: d.left, der: d.right, arr: d.top, aba: d.bottom }, l)),
      );
    });
  };

  const revisar = (): void => {
    const zona = unir(partes.map((p) => p.getBoundingClientRect()));
    const tapa = !vacia(zona) && (tapaUnControl(zona) || tapaUnTexto(dibujo()));
    if (tapa === cede) return;
    cede = tapa;
    boton.setAttribute('data-sm-cede', tapa ? 'true' : 'false');
  };

  return {
    medir: () => {
      // Los diálogos tapan todo con su velo: lo de adentro no cuenta. Los rieles son el marco, no el contenido.
      const fuera = (el: Element): boolean => boton.contains(el) || el.closest('dialog, [data-sm-riel]') !== null;
      obstaculos = buscarTodos(c.seccion, OBSTACULOS, HTMLElement).filter((el) => !fuera(el));
      textos = textosDe(c.seccion).filter((el) => !fuera(el));
      yAnterior = Number.NaN;
    },
    actualizar: (ctx) => {
      if (ctx.nivel() !== 'SM') {
        yAnterior = Number.NaN;
        return;
      }
      cuadros++;
      // Este módulo corre antes que las coreografías: lee el diseño del cuadro anterior (sin forzar otro cálculo).
      // Por eso, tras un cambio de scroll se mira también el cuadro siguiente, con lo que se movió con ese scroll.
      const movido = ctx.y !== yAnterior;
      if (!movido && !otraVez && cuadros < CUADROS_SIN_SCROLL) return;
      otraVez = movido;
      cuadros = 0;
      yAnterior = ctx.y;
      revisar();
    },
    destruir: () => {
      rango.detach();
      boton.removeAttribute('data-sm-cede');
    },
  };
}

/** Los elementos de un bloque que tienen texto propio (con letra). */
function textosDe(raiz: HTMLElement): HTMLElement[] {
  const elementos = new Set<HTMLElement>();
  const recorrido = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
    const el = n.parentElement;
    if (el && (n.textContent ?? '').trim()) elementos.add(el);
  }
  return Array.from(elementos);
}
