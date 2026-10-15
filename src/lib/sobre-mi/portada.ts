/**
 * La portada (T45, K5): la entrada es una sola línea de tiempo de GSAP (≈ 3,7 s) que corre una vez, cuando la
 * sección queda arriba. Cada letra de la palabra gigante entra desde `yPercent 120` con `skewX 8` y desenfoque; los
 * nombres, la flor, el marco con el personaje, la órbita dibujada con `stroke-dashoffset`, las estrellas, las
 * píldoras de años con sus líneas, la fecha dispersa, la invitación (clip-path), las barras del código y el aviso
 * entran en los tiempos de la ficha. Con movimiento reducido todo ya está en su sitio y no se arma nada.
 *
 * También ajusta el tamaño de la palabra para que ocupe el 94 % del ancho (de ≈ 3 % a ≈ 97 %, como «WEDDING»).
 */
import gsap from 'gsap';
import type { Contexto, Modulo } from './contexto';
import { buscarTodos } from './util';

/** K5: la palabra ocupa de 3 % a 97 % del ancho. */
const ANCHO_PALABRA = 0.94;
/** Tope por el alto: en pantallas muy anchas y bajas (1366 × 650, 2560 × 1080, 5120 × 1440) la palabra de lado a lado
 *  taparía el nombre y el marco. 0,27 del alto deja intactos 1440 × 900 y 1920 × 1080 (donde ya cabía). */
const ALTO_PALABRA = 0.27;

export function iniciarPortada(c: Contexto): Modulo {
  const bloque = c.seccion.querySelector<HTMLElement>('[data-sm-bloque="portada"]');
  const palabra = bloque?.querySelector<HTMLElement>('[data-sm="portada-palabra"]');
  if (!bloque || !palabra) return { destruir: () => undefined };

  const letras = buscarTodos(bloque, '[data-sm-letra]', Element);
  const q = (selector: string): Element[] => buscarTodos(bloque, selector, Element);
  const nombre1 = q('[data-sm-p="nombre-1"]');
  const nombre2 = q('[data-sm-p="nombre-2"]');
  const flor = q('[data-sm-p="flor"]');
  const imagen = q('[data-sm-p="imagen"]');
  const orbita = bloque.querySelector<SVGElement>('[data-sm-p="orbita"]');
  const estrellas = Array.from(bloque.querySelectorAll<SVGElement>('[data-sm-p="estrella"]'));
  const anios = q('[data-sm-p="anio"]');
  const lineas = q('[data-sm-p="anio-linea"]');
  const dispersos = q('[data-sm-p="disperso"]');
  const invitacion = q('[data-sm-p="invitacion"]');
  const barras = q('[data-sm-p="barra"]');
  const codigo = q('[data-sm-p="codigo"]');
  const baja = q('[data-sm-p="baja"]');
  const cuadros = q('[data-sm-p="cuadro"]');

  let tope = 0;
  let alto = 0;
  let jugada = false;
  let linea: gsap.core.Timeline | null = null;

  /** Ajusta el tamaño de la palabra: mide el ancho a 100 px y lo escala al 94 % del ancho del bloque, sin pasar de
   *  una fracción del alto. La medida no depende de una transición de CSS (`.sm-p-palabra` no tiene). */
  const ajustarPalabra = (): void => {
    palabra.style.setProperty('--sm-palabra-tam', '100px');
    const ancho100 = palabra.getBoundingClientRect().width;
    if (ancho100 > 0) {
      const tam = Math.min((100 * ANCHO_PALABRA * bloque.clientWidth) / ancho100, ALTO_PALABRA * bloque.clientHeight);
      palabra.style.setProperty('--sm-palabra-tam', `${tam.toFixed(2)}px`);
    }
  };

  const medir = (): void => {
    ajustarPalabra();
    const r = bloque.getBoundingClientRect();
    tope = r.top + window.scrollY;
    alto = r.height;
  };

  /** El estado de partida (antes de la entrada): lo que Tonami muestra vacío. Solo con movimiento. */
  const armar = (): void => {
    gsap.set(letras, { yPercent: 120, skewX: 8, filter: 'blur(6px)' });
    gsap.set(nombre1, { x: -64, opacity: 0, filter: 'blur(5px)' });
    gsap.set(nombre2, { x: 64, opacity: 0, filter: 'blur(5px)' });
    gsap.set(flor, { scale: 0.4, rotation: -12, opacity: 0 });
    gsap.set(imagen, { scale: 1.08, opacity: 0, filter: 'blur(12px)' });
    if (orbita) gsap.set(orbita, { strokeDashoffset: 1000 });
    gsap.set(estrellas, { scale: 0, transformOrigin: '50% 50%' });
    gsap.set(anios, { scale: 0.8, opacity: 0 });
    gsap.set(lineas, { scaleX: 0 });
    gsap.set(dispersos, { opacity: 0, filter: 'blur(4px)' });
    gsap.set(invitacion, { clipPath: 'inset(0% 100% 0% 0%)' });
    gsap.set(barras, { scaleY: 0 });
    gsap.set([codigo, baja], { opacity: 0 });
    gsap.set(cuadros, { scale: 0, opacity: 0 });
  };

  const jugar = (): void => {
    jugada = true;
    const todos = [...letras, ...nombre1, ...nombre2, ...flor, ...imagen, ...anios, ...lineas, ...dispersos, ...invitacion, ...barras, ...codigo, ...baja, ...cuadros];
    const tl = gsap.timeline({
      onComplete: () => {
        // Al terminar se limpian los estilos en línea (K5): la portada queda como el CSS la dejó.
        gsap.set([...todos, ...estrellas], { clearProps: 'transform,opacity,filter,clipPath' });
        if (orbita) gsap.set(orbita, { clearProps: 'strokeDashoffset' });
      },
    });
    tl.to(letras, { yPercent: 0, skewX: 0, filter: 'blur(0px)', duration: 0.8, ease: 'back.out(1.4)', stagger: 0.06 }, 0);
    tl.to(nombre1, { x: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out' }, 0.9);
    tl.to(nombre2, { x: 0, opacity: 1, filter: 'blur(0px)', duration: 0.9, ease: 'power3.out' }, 0.9);
    tl.to(flor, { scale: 1, rotation: 0, opacity: 1, duration: 0.7, ease: 'back.out(1.6)' }, 1.3);
    tl.to(imagen, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 1.1, ease: 'power2.out' }, 1.6);
    if (orbita) tl.to(orbita, { strokeDashoffset: 0, duration: 0.75, ease: 'power2.inOut' }, 2.6);
    tl.to(estrellas, { scale: 1, duration: 0.5, ease: 'back.out(1.7)', stagger: 0.15 }, 3.3);
    if (anios[0]) tl.to(anios[0], { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.7)' }, 0.85);
    if (anios[1]) tl.to(anios[1], { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(1.7)' }, 1.15);
    if (lineas[0]) tl.to(lineas[0], { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 0.95);
    if (lineas[1]) tl.to(lineas[1], { scaleX: 1, duration: 0.3, ease: 'power2.out' }, 1.25);
    tl.to(dispersos, { opacity: 1, filter: 'blur(0px)', duration: 0.35, stagger: 0.06 }, 1.0);
    tl.to(invitacion, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.5, ease: 'power2.inOut' }, 1.15);
    tl.to(barras, { scaleY: 1, duration: 0.3, ease: 'power2.out', stagger: 0.04 }, 1.25);
    tl.to(codigo, { opacity: 1, duration: 0.3 }, 1.5);
    tl.to(baja, { opacity: 1, duration: 0.4 }, 1.35);
    tl.to(cuadros, { scale: 1, opacity: 1, duration: 0.3, ease: 'back.out(1.7)', stagger: { each: 0.02, from: 'random' } }, 1.4);
    linea = tl;
  };

  if (!c.reducido) armar();

  const actualizar = (ctx: Contexto): void => {
    if (jugada || ctx.reducido || ctx.nivel() !== 'SM') return;
    // La entrada corre cuando la sección queda arriba: la mitad de la pantalla cae dentro de la portada.
    const mitad = ctx.y + ctx.alto * 0.5;
    if (mitad >= tope && mitad <= tope + alto) jugar();
  };

  return {
    medir,
    actualizar,
    destruir: () => {
      linea?.kill();
    },
  };
}
