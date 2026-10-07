/**
 * El titular «JSMMDZ» del home (T33): su ajuste al ancho y su entrada letra por letra.
 *
 * El h1 está partido a mano en letras, cada una dentro de su máscara (sin SplitText: el sitio usa
 * GSAP core). La tinta rasteriza el titular desde estas mismas letras, así que lo que se ve en el canvas
 * calza con el DOM.
 */
import gsap from 'gsap';

/** K5 (noth.in): cada letra sube desde su máscara, 1,8 s, con 0,07 s entre letras en orden aleatorio. */
const ENTRADA = {
  desdeYPercent: 120,
  duracion: 1.8,
  curva: 'power4.inOut',
  cadaLetra: 0.07,
  retardo: 0.2,
} as const;

/** T36: la base de las letras cae al 92,6 % del alto (diagramación del autor: 833 px a 900). */
const BASE_DE_LAS_LETRAS = 0.926;

function letrasDe(titular: HTMLElement): HTMLElement[] {
  return Array.from(titular.querySelectorAll<HTMLElement>('[data-n1-letra]'));
}

/**
 * Calcula el tamaño de letra con el que «JSMMDZ» ocupa todo el ancho del h1 (que ya trae sus márgenes de
 * 18 px a 1440, proporcionales). Se mide cada letra por separado, con la fuente real: el DOM las pone
 * como cajas sueltas, sin el ajuste de pares que haría una sola palabra.
 */
export function ajustarTitular(titular: HTMLElement): void {
  const letras = letrasDe(titular);
  const primera = letras[0];
  if (!primera) return;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  const estilo = getComputedStyle(primera);
  ctx.font = `${estilo.fontWeight} 100px ${estilo.fontFamily}`;
  const anchoA100 = letras.reduce((suma, letra) => suma + ctx.measureText(letra.textContent ?? '').width, 0);
  const ancho = titular.getBoundingClientRect().width;
  if (anchoA100 <= 0 || ancho <= 0) return;
  const tamano = (ancho * 100) / anchoA100;
  titular.style.setProperty('--n1-titular-tam', `${tamano.toFixed(3)}px`);
  bajarTitular(titular, ctx, letras, tamano);
}

/**
 * Pone la base de las letras al 92,6 % del alto de la capa (diagramación del autor, T36). Hace falta medirla:
 * la línea base dentro del h1 depende de las métricas de la fuente, y el h1 es de línea 1. Además deja en la
 * sección `--n1-letras-arriba`, el borde de arriba de las letras, para poner las redes justo encima.
 */
function bajarTitular(titular: HTMLElement, ctx: CanvasRenderingContext2D, letras: HTMLElement[], tamano: number): void {
  const capa = titular.offsetParent;
  const sonda = titular.querySelector<HTMLElement>('[data-n1-sonda]');
  if (!(capa instanceof HTMLElement) || !sonda) return;
  const alto = capa.clientHeight;
  if (alto <= 0) return;
  // La línea base, contada desde el borde de arriba del h1 (la sonda es un cuadrito de alto 0 sobre ella).
  const base = sonda.getBoundingClientRect().bottom - titular.getBoundingClientRect().top;
  const lineaBase = alto * BASE_DE_LAS_LETRAS;
  titular.style.setProperty('--n1-titular-arriba', `${(lineaBase - base).toFixed(2)}px`);
  const texto = letras.map((letra) => letra.textContent ?? '').join('');
  const altoLetras = (ctx.measureText(texto).actualBoundingBoxAscent / 100) * tamano;
  titular.closest<HTMLElement>('section')?.style.setProperty('--n1-letras-arriba', `${(lineaBase - altoLetras).toFixed(2)}px`);
}

/** Deja las letras fuera de su máscara, listas para la entrada. */
export function esconderLetras(titular: HTMLElement): void {
  gsap.set(letrasDe(titular), { yPercent: ENTRADA.desdeYPercent });
}

/** Deja las letras enteras y sin transformaciones: el DOM final que rasteriza la tinta. */
export function mostrarLetras(titular: HTMLElement): void {
  const letras = letrasDe(titular);
  gsap.killTweensOf(letras);
  gsap.set(letras, { clearProps: 'transform' });
}

/** La entrada del titular (K5). Devuelve la función que la cancela. */
export function animarEntrada(titular: HTMLElement, alTerminar: () => void): () => void {
  const letras = letrasDe(titular);
  const tween = gsap.fromTo(
    letras,
    { yPercent: ENTRADA.desdeYPercent },
    {
      yPercent: 0,
      duration: ENTRADA.duracion,
      ease: ENTRADA.curva,
      stagger: { each: ENTRADA.cadaLetra, from: 'random' },
      delay: ENTRADA.retardo,
      onComplete: alTerminar,
    },
  );
  return () => {
    tween.kill();
  };
}
