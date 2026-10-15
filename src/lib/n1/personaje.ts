/**
 * El personaje del home (T44): su tamaño y su posición, y el punto de entrada para montarlo.
 *
 * Es un video en bucle (mp4 de color + máscara) que el renderer de la tinta dibuja detrás de las letras
 * (`lib/n1/tinta.ts`). El `<img>` del póster (`img[data-n1-personaje]`) sigue en el DOM y es su caja: el
 * renderer dibuja el cuadro del video exactamente donde está el `<img>`, así que el paralaje (que mueve el
 * `<img>` con GSAP) mueve lo que se ve, y sin WebGL o con movimiento reducido el póster queda quieto en su sitio.
 *
 * Aquí se calcula esa caja (`recalcular`), con la regla de `docs/1-PRODUCTO.md` § 7, «El personaje del home
 * animado», y de la tarea T44: las suelas en la línea base de las letras, el eje al 48 % del ancho y la cabeza
 * a la altura del borde de arriba del botón «Contacto» (desde portátil) o debajo de las columnas (celular y
 * tablet vertical), y se achica si la figura quedara a menos de 16 px de una columna.
 */

/** El cuadro del póster y del video (cada mitad), en px. */
export const CUADRO = { ancho: 1080, alto: 1920 } as const;
/** La figura dentro del cuadro, medida en la máscara de los 240 cuadros: las suelas no se mueven (y 1883). */
export const FIGURA = { x0: 173, x1: 910, y0: 47, y1: 1883 } as const;
export const ALTO_FIGURA_EN_EL_CUADRO = (FIGURA.y1 - FIGURA.y0) / CUADRO.alto;

/** Con más de este ancho (px) es «portátil»: la cabeza va a la altura del botón; con menos, debajo de las columnas. */
const ANCHO_PORTATIL = 768;
/** La cabeza, a la altura del borde de arriba del botón «Contacto»: el 3,6 % del alto (T36). */
const CABEZA_PORTATIL = 0.036;
/** En celular y tablet vertical, el aire entre las columnas y la cabeza: el 2 % del alto. */
const AIRE_BAJO_LAS_COLUMNAS = 0.02;
/** El eje del cuadro (y de la figura) va al 48 % del ancho: la diagramación del autor. */
const EJE = 0.48;
/** La figura no se acerca a una columna a menos de esto (px). */
const SEPARACION_MINIMA = 16;
/** Por debajo de este alto de figura (px) no se sigue achicando. */
const ALTO_MINIMO = 20;

// Lo que mide la figura a cada lado del eje, en fracciones de su alto (de la cabeza a las suelas).
const ALTO_FIGURA_PX = FIGURA.y1 - FIGURA.y0;
const A_LA_IZQUIERDA = (CUADRO.ancho / 2 - FIGURA.x0) / ALTO_FIGURA_PX;
const A_LA_DERECHA = (FIGURA.x1 - CUADRO.ancho / 2) / ALTO_FIGURA_PX;

interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PersonajeMontado {
  /** Lo que el paralaje traslada: el `<img>` del póster, que es la caja donde se dibuja el video. */
  elemento: HTMLImageElement;
  /** El video de color + máscara (`video[data-n1-personaje-video]`), si está en el DOM. */
  video: HTMLVideoElement | null;
  /** Vuelve a calcular el tamaño y la posición (cambio de tamaño, fuente ya cargada, titular ya ajustado). */
  recalcular: () => void;
  /** Libera lo que `montarPersonaje` haya creado. */
  destruir: () => void;
}

/** ¿Se tocan, con un margen? (la misma prueba que usa la regla para no acercarse a las columnas). */
function cerca(a: Rect, b: Rect, margen: number): boolean {
  return a.x0 < b.x1 + margen && b.x0 < a.x1 + margen && a.y0 < b.y1 + margen && b.y0 < a.y1 + margen;
}

/** La caja de un elemento relativa a la sección. */
function cajaEn(elemento: Element, seccion: DOMRect): Rect {
  const r = elemento.getBoundingClientRect();
  return { x0: r.left - seccion.left, y0: r.top - seccion.top, x1: r.right - seccion.left, y1: r.bottom - seccion.top };
}

export function montarPersonaje(seccion: HTMLElement): PersonajeMontado | null {
  const imagen = seccion.querySelector<HTMLImageElement>('img[data-n1-personaje]');
  if (!imagen) return null;
  const video = seccion.querySelector<HTMLVideoElement>('video[data-n1-personaje-video]');

  const recalcular = (): void => {
    const caja = seccion.getBoundingClientRect();
    const capaAtras = seccion.querySelector('[data-n1-capa-atras]');
    const sonda = seccion.querySelector('[data-n1-sonda]');
    const izquierda = seccion.querySelector('[data-n1-columna="izquierda"]');
    const derecha = seccion.querySelector('[data-n1-columna="derecha"]');
    if (!capaAtras || !sonda || !izquierda || !derecha || caja.width <= 0 || caja.height <= 0) return;

    // Las suelas, en la línea base de las letras. La sonda es el cuadrito de alto 0 que el titular pone sobre ella.
    // Se mide contra la capa de atrás (que ocupa toda la sección): el paralaje la mueve a ella y a la sonda por igual.
    const lineaBase = sonda.getBoundingClientRect().bottom - capaAtras.getBoundingClientRect().top;
    const eje = EJE * caja.width;
    const columnas = [cajaEn(izquierda, caja), cajaEn(derecha, caja)];

    const cabeza =
      caja.width > ANCHO_PORTATIL
        ? CABEZA_PORTATIL * caja.height
        : Math.max(columnas[0].y1, columnas[1].y1) + AIRE_BAJO_LAS_COLUMNAS * caja.height;
    // Alto de la figura (de la cabeza a las suelas); se achica de a un píxel hasta que no se acerque a las columnas.
    let alto = lineaBase - cabeza;
    const figuraCon = (h: number): Rect => ({ x0: eje - A_LA_IZQUIERDA * h, x1: eje + A_LA_DERECHA * h, y0: lineaBase - h, y1: lineaBase });
    while (alto > ALTO_MINIMO && columnas.some((c) => cerca(figuraCon(alto), c, SEPARACION_MINIMA))) alto -= 1;
    alto = Math.max(alto, ALTO_MINIMO);

    // El cuadro entero: la figura mide `alto`, y el cuadro es más grande que ella.
    const altoCuadro = (alto * CUADRO.alto) / ALTO_FIGURA_PX;
    const anchoCuadro = (altoCuadro * CUADRO.ancho) / CUADRO.alto;
    seccion.style.setProperty('--n1-personaje-alto', `${altoCuadro.toFixed(2)}px`);
    seccion.style.setProperty('--n1-personaje-arriba', `${(lineaBase - (FIGURA.y1 / CUADRO.alto) * altoCuadro).toFixed(2)}px`);
    seccion.style.setProperty('--n1-personaje-izquierda', `${(eje - anchoCuadro / 2).toFixed(2)}px`);
  };

  return {
    elemento: imagen,
    video,
    recalcular,
    destruir: (): void => {
      seccion.style.removeProperty('--n1-personaje-alto');
      seccion.style.removeProperty('--n1-personaje-arriba');
      seccion.style.removeProperty('--n1-personaje-izquierda');
    },
  };
}
