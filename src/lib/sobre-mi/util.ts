/**
 * Utilidades pequeñas de «Sobre mí y contacto» (T45): límites, mezclas, curvas de Tonami (K27) y lectura de
 * colores desde los tokens. Los colores nunca se escriben en el código: salen de las variables CSS
 * (`styles/tokens.css`) y aquí solo se leen y se mezclan.
 */

export const limitar = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));
export const mezclar = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Smoothstep entre `a` y `b` (0 antes de `a`, 1 después de `b`). */
export function suavizado(a: number, b: number, x: number): number {
  const t = limitar((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Cuánto avanzó `x` entre `a` y `b`, de 0 a 1. */
export const tramo = (a: number, b: number, x: number): number => limitar((x - a) / (b - a), 0, 1);

/**
 * Una curva cubic-bezier(x1, y1, x2, y2) como función de t en [0, 1] (la misma de CSS). Los easings de Tonami (K27):
 * in-out (.65,0,.35,1), out (.16,1,.3,1), barrido (.33,1,.68,1) y atrás (.34,1.46,.64,1).
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (t: number): number => ((ax * t + bx) * t + cx) * t;
  const y = (t: number): number => ((ay * t + by) * t + cy) * t;
  const dx = (t: number): number => (3 * ax * t + 2 * bx) * t + cx;
  return (progreso: number): number => {
    if (progreso <= 0) return 0;
    if (progreso >= 1) return 1;
    // Newton con respaldo de bisección: se busca la t cuya x vale `progreso`.
    let t = progreso;
    for (let i = 0; i < 8; i++) {
      const error = x(t) - progreso;
      if (Math.abs(error) < 1e-5) return y(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= error / d;
    }
    let bajo = 0;
    let alto = 1;
    t = progreso;
    for (let i = 0; i < 24; i++) {
      const v = x(t);
      if (Math.abs(v - progreso) < 1e-5) break;
      if (v < progreso) bajo = t;
      else alto = t;
      t = (bajo + alto) / 2;
    }
    return y(t);
  };
}

/** La curva de los saltos de la historia, del imán y de los botones (K14): (.65, 0, .35, 1). */
export const curvaEntradaSalida = bezier(0.65, 0, 0.35, 1);

export type Rgb = readonly [number, number, number];

/** Lee un color de una variable CSS (`#RRGGBB`, `#RGB` o `rgb()`) y lo devuelve como [r, g, b] de 0 a 255. */
export function leerColor(elemento: Element, variable: string): Rgb {
  const texto = getComputedStyle(elemento).getPropertyValue(variable).trim();
  return analizarColor(texto);
}

export function analizarColor(texto: string): Rgb {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(texto);
  if (hex) {
    const h = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(texto);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [0, 0, 0];
}

export function mezclarColor(a: Rgb, b: Rgb, t: number): Rgb {
  return [mezclar(a[0], b[0], t), mezclar(a[1], b[1], t), mezclar(a[2], b[2], t)];
}

export const aCss = (c: Rgb): string => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

/** Un elemento que tiene que existir en el marcado de la sección; si falta, el módulo no arranca. */
export function buscar<T extends Element>(raiz: ParentNode, selector: string, tipo: abstract new () => T): T | null {
  const el = raiz.querySelector(selector);
  return el instanceof tipo ? el : null;
}

export function buscarTodos<T extends Element>(raiz: ParentNode, selector: string, tipo: abstract new () => T): T[] {
  return Array.from(raiz.querySelectorAll(selector)).filter((el): el is T => el instanceof tipo);
}

/** Posición del borde de arriba de un elemento en el documento (px), sin contar lo que lo mueva el escenario fijo. */
export const topeAbsoluto = (el: Element): number => el.getBoundingClientRect().top + window.scrollY;

/** Las preferencias del visitante que la sección respeta. */
export const movimientoReducido = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const conRaton = (): boolean => window.matchMedia('(any-hover: hover)').matches;
