/**
 * La historia por semestres (T45, K13–K18). Un bloque alto con su escenario fijo: 4 capítulos (semestres), cada uno
 * de 1,5 pantallas de scroll, y dentro de cada capítulo una parada por imagen. El módulo:
 *   · calcula las paradas (`scrollY` de cada una, enteros) y las publica en `data-sm-paradas-y`; publica también
 *     `data-sm-parada-actual` y `data-sm-capitulo-actual` (desde 0);
 *   · el imán (K14): 120 ms después de que el scroll se detiene con la historia fijada, va a la parada más cercana con
 *     `lenis.scrollTo` (curva (.65,0,.35,1)), o a la siguiente en la dirección del gesto si fue largo. Se corta con
 *     la rueda o el toque. No hay autoplay;
 *   · los botones anterior / siguiente / saltar y los semestres (mismo `scrollTo`; duración
 *     `min(1,1 s, max(0,4 s, 0,9 s × capítulos))`; «saltar» lleva al cierre en 1,1 s);
 *   · la rueda de dígitos del semestre (K15: solo se mueven los dígitos que cambian, 0,48 s y 36 ms entre columnas),
 *     la banda del rótulo y el relevo de los textos y del «¿Sabías que?» (0,56 s, 70 ms entre textos);
 *   · el círculo con la película en WebGL (K16, `lib/three/sobre-mi/pelicula.ts`, con `import()`), su arco de
 *     progreso con la estrella y, sin WebGL o con el contexto perdido, la `<img>` de la parada actual;
 *   · el cierre (K18): paneo del escenario, la estrella sola sobre la línea, el interludio y la inversión de la
 *     escena a la página invertida del tema, que vuelve a clara al llegar al contacto.
 * Todo lo que sigue al scroll se calcula con `window.scrollY` en el reloj único; lo que cambia de capítulo o de
 * imagen es una animación de GSAP en el tiempo. Con movimiento reducido no hay Lenis suave, ni imán, ni paneo.
 */
import gsap from 'gsap';
import { obtenerLenis } from '@/lib/pelicula/lenis';
import { pasoEnCurso } from '@/lib/pelicula/estado-paso';
import type { Contexto, Modulo } from './contexto';
import type { CapituloConfig } from './config';
import { HISTORIA_ENTRADA, HISTORIA_PANEO, HISTORIA_POR_CAPITULO } from './geometria';
import type { ControladorPelicula } from '@/lib/three/sobre-mi/pelicula';
import { aCss, buscarTodos, curvaEntradaSalida, leerColor, limitar, mezclar, mezclarColor, suavizado, tramo, type Rgb } from './util';

/** K14: el imán espera 120 ms de quietud antes de acomodar la historia. */
const ESPERA_IMAN_S = 0.12;
/** K14: un gesto rápido que recorre más del 30 % de la distancia entre paradas salta a la siguiente en su dirección. */
const GESTO_LARGO = 0.3;
/** K14: «rápido» es más de 1,2 px por ms (en el pico del gesto). */
const GESTO_RAPIDO = 1.2;
/** K14: la duración de un salto entre capítulos: min(1,1 s, max(0,4 s, 0,9 s × capítulos)). */
const SALTO_MAXIMO_S = 1.1;
const SALTO_MINIMO_S = 0.4;
const SALTO_POR_CAPITULO_S = 0.9;
/** K15: la rueda de dígitos. */
const DIGITO_S = 0.48;
const DIGITO_ESCALONADO_S = 0.036;
/** K15: el relevo de textos. */
const RELEVO_S = 0.56;
const RELEVO_ESCALONADO_S = 0.07;
/** K15: la banda del rótulo del capítulo. */
const BANDA_S = 0.24;
/** K16: el cambio de imagen dentro del shader. */
const CAMBIO_IMAGEN_S = 0.9;
/** K18: dónde, dentro del cierre (en pantallas), se invierte la escena, aparece el interludio y vuelve la página clara. */
const OSCURO_SUBE: readonly [number, number] = [0.35, 0.95];
const OSCURO_BAJA: readonly [number, number] = [2.9, 3.5];
const INTERLUDIO_ENTRA: readonly [number, number] = [1.2, 1.7];
const INTERLUDIO_SALE: readonly [number, number] = [2.85, 3.25];
/** K18: la escena se considera invertida (data-sm-invertida) cuando está del todo oscura; vuelve a clara al soltarse. */
const INVERTIDA_ENTRA = 0.999;
const INVERTIDA_SALE = 0.9;
/** Cuánto antes de que el escenario quede fijo se empieza a cargar el WebGL de la película (pantallas). */
const PRECARGA_PANTALLAS = 2.5;

interface Parada {
  y: number;
  capitulo: number;
  /** Índice de la imagen entre las de todos los capítulos. */
  imagen: number;
}

export function iniciarHistoria(c: Contexto): Modulo {
  const seccion = c.seccion;
  const bloque = seccion.querySelector<HTMLElement>('[data-sm-bloque="historia"]');
  const escena = seccion.querySelector<HTMLElement>('[data-sm-h="escena"]');
  const circulo = seccion.querySelector<HTMLElement>('[data-sm="historia-circulo"]');
  const lienzo = circulo?.querySelector<HTMLCanvasElement>('canvas[data-sm-lienzo="pelicula"]');
  if (!bloque || !escena || !circulo || !lienzo) return { destruir: () => undefined };

  const capitulos: CapituloConfig[] = c.config.historia.capitulos;
  const imagenes = capitulos.flatMap((cap, ci) => cap.imagenes.map((im, ii) => ({ ...im, ci, ii })));
  const fotos = buscarTodos(circulo, 'img[data-sm-foto]', HTMLImageElement);
  const arco = seccion.querySelector<SVGCircleElement>('[data-sm-h="arco"]');
  const estrellaAro = seccion.querySelector<HTMLElement>('[data-sm-h="estrella-aro"]');
  const flecha = seccion.querySelector<HTMLElement>('[data-sm-h="flecha"]');
  const coronaFlores = Array.from(seccion.querySelectorAll<SVGElement>('[data-sm="historia-corona"] [data-sm-corona-flor]'));
  const botonesAnios = buscarTodos(seccion, '[data-sm="historia-anios"] button', HTMLButtonElement);
  const anterior = seccion.querySelector<HTMLButtonElement>('button[data-sm-historia="anterior"]');
  const siguiente = seccion.querySelector<HTMLButtonElement>('button[data-sm-historia="siguiente"]');
  const saltar = seccion.querySelector<HTMLButtonElement>('button[data-sm-historia="saltar"]');
  const columnas = buscarTodos(seccion, '[data-sm="historia-anio"] [data-sm-digito]', HTMLElement);
  const rotulo = seccion.querySelector<HTMLElement>('[data-sm="historia-rotulo"]');
  const banda = seccion.querySelector<HTMLElement>('[data-sm-h="banda"]');
  const textoEl = seccion.querySelector<HTMLElement>('[data-sm-relevo="texto"]');
  const extraEl = seccion.querySelector<HTMLElement>('[data-sm-relevo="extra"]');
  const sabiasEl = seccion.querySelector<HTMLElement>('[data-sm-relevo="sabias"]');
  const pieEl = seccion.querySelector<HTMLElement>('[data-sm-relevo="pie"]');
  const vivo = seccion.querySelector<HTMLElement>('[data-sm="historia-vivo"]');
  const cierreEstrella = seccion.querySelector<HTMLElement>('[data-sm-h="cierre-estrella"]');
  const cierreLinea = seccion.querySelector<HTMLElement>('[data-sm-h="cierre-linea"]');
  const interludio = seccion.querySelector<HTMLElement>('[data-sm="interludio"]');

  const abort = new AbortController();
  const { signal } = abort;
  let destruido = false;

  // ---------- Medidas ----------
  let paradas: Parada[] = [];
  let tope = 0;
  let altoBloque = 0;
  let cierreY = 0;
  let xEstrellaCierre = 0;
  let posicionesAnios: number[] = [];
  /** Avance del aro (0 a 1) en la última parada: la corona está completa al llegar ahí. */
  let avanceUltima = 1;
  let pantalla = c.alto;

  const medir = (): void => {
    pantalla = c.alto;
    const r = bloque.getBoundingClientRect();
    tope = r.top + window.scrollY;
    altoBloque = r.height;
    const nuevas: Parada[] = [];
    let imagen = 0;
    capitulos.forEach((cap, ci) => {
      const n = cap.imagenes.length;
      for (let k = 0; k < n; k++) {
        const pantallas = HISTORIA_ENTRADA + HISTORIA_POR_CAPITULO * ci + (HISTORIA_POR_CAPITULO * k) / n;
        nuevas.push({ y: Math.round(tope + pantallas * pantalla), capitulo: ci, imagen: imagen++ });
      }
    });
    paradas = nuevas;
    cierreY = Math.round(tope + (HISTORIA_ENTRADA + HISTORIA_POR_CAPITULO * capitulos.length) * pantalla);
    avanceUltima = limitar((paradas[paradas.length - 1].y - paradas[0].y) / Math.max(1, cierreY - paradas[0].y), 0.01, 1);
    const publicado = JSON.stringify(paradas.map((p) => p.y));
    if (bloque.getAttribute('data-sm-paradas-y') !== publicado) bloque.setAttribute('data-sm-paradas-y', publicado);
    // La estrella del cierre sale del aro: arranca en el centro del círculo, sobre la línea.
    xEstrellaCierre = circulo.offsetLeft + circulo.offsetWidth / 2;
    posicionesAnios = botonesAnios.map((b) => b.offsetTop + b.offsetHeight / 2);
    ponerFlecha(capituloActual, true);
  };

  const primeraParadaDe = (capitulo: number): number => paradas.find((p) => p.capitulo === capitulo)?.y ?? cierreY;

  const masCercana = (y: number): number => {
    let mejor = 0;
    let distancia = Number.POSITIVE_INFINITY;
    paradas.forEach((p, i) => {
      const d = Math.abs(p.y - y);
      if (d < distancia) {
        distancia = d;
        mejor = i;
      }
    });
    return mejor;
  };

  // ---------- El desplazamiento: Lenis, o un corte con movimiento reducido ----------
  // Un salto de los botones ya termina en una parada: el imán no lo corrige (se cancela con la rueda o el toque).
  let programatico = false;
  const irA = (y: number, duracion: number): void => {
    programatico = true;
    const lenis = obtenerLenis();
    if (c.reducido || !lenis) {
      window.scrollTo({ top: y, behavior: 'instant' });
      return;
    }
    lenis.scrollTo(y, { duration: duracion, easing: curvaEntradaSalida });
  };

  const duracionSalto = (capitulos_: number): number => Math.min(SALTO_MAXIMO_S, Math.max(SALTO_MINIMO_S, SALTO_POR_CAPITULO_S * capitulos_));

  // ---------- El estado: parada y capítulo ----------
  let paradaActual = -1;
  let capituloActual = 0;
  let valorDigitos = capitulos[0].digitos;

  const finDeLinea = (el: HTMLElement | null): void => {
    if (el) gsap.set(el, { clearProps: 'transform,opacity,filter' });
  };

  /** El relevo de un texto (K15): el saliente sube con desenfoque y el entrante llega desde abajo. */
  const relevo = (el: HTMLElement | null, nuevo: string, orden: number, instantaneo: boolean): void => {
    if (!el) return;
    if (instantaneo) {
      el.textContent = nuevo;
      return;
    }
    gsap.killTweensOf(el);
    const retraso = orden * RELEVO_ESCALONADO_S;
    const mitad = RELEVO_S / 2;
    gsap.to(el, {
      y: -14,
      opacity: 0,
      scale: 0.94,
      filter: 'blur(4px)',
      duration: mitad,
      delay: retraso,
      ease: 'power3.in',
      onComplete: () => {
        el.textContent = nuevo;
        gsap.fromTo(
          el,
          { y: 18, opacity: 0, scale: 0.94, filter: 'blur(4px)' },
          { y: 0, opacity: 1, scale: 1, filter: 'blur(0px)', duration: mitad, ease: 'power3.out', onComplete: () => finDeLinea(el) },
        );
      },
    });
  };

  /** La banda del rótulo (K15): barre el texto y a la mitad se cambia. */
  const cambiarRotulo = (nuevo: string, instantaneo: boolean): void => {
    if (!rotulo) return;
    if (instantaneo || !banda) {
      rotulo.textContent = nuevo;
      return;
    }
    gsap.killTweensOf(banda);
    const tl = gsap.timeline({ onComplete: () => finDeLinea(banda) });
    tl.fromTo(banda, { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: BANDA_S, ease: 'power2.inOut' });
    tl.call(() => {
      rotulo.textContent = nuevo;
    });
    tl.to(banda, { clipPath: 'inset(0% 0% 0% 100%)', duration: BANDA_S, ease: 'power2.inOut' });
  };

  /** La rueda de dígitos (K15): solo ruedan los dígitos que cambian; el saliente sube y el entrante llega desde abajo. */
  const rodarDigitos = (nuevo: string, sube: boolean, instantaneo: boolean): void => {
    const viejo = valorDigitos;
    valorDigitos = nuevo;
    const actuales = [...viejo].filter((ch) => ch !== '.');
    const siguientes = [...nuevo].filter((ch) => ch !== '.');
    columnas.forEach((col, j) => {
      const pista = col.querySelector<HTMLElement>('[data-sm-pista]');
      if (!pista) return;
      const para = siguientes[j] ?? '';
      // Una rueda en marcha se termina de golpe antes de empezar la nueva.
      gsap.killTweensOf(pista);
      const glifosPrevios = buscarTodos(pista, '.sm-h-glifo', HTMLElement);
      if (glifosPrevios.length > 1) {
        // Una rueda a medias se termina de golpe: queda el dígito que se estaba mostrando.
        pista.replaceChildren(glifosPrevios.find((g) => g.textContent === actuales[j]) ?? glifosPrevios[glifosPrevios.length - 1]);
        gsap.set(pista, { clearProps: 'transform' });
      }
      if (actuales[j] === para) return;
      if (instantaneo) {
        const g = pista.querySelector<HTMLElement>('.sm-h-glifo');
        if (g) g.textContent = para;
        return;
      }
      const entrante = document.createElement('span');
      entrante.className = 'sm-h-glifo';
      entrante.textContent = para;
      // De derecha a izquierda, 36 ms entre columnas.
      const retraso = (columnas.length - 1 - j) * DIGITO_ESCALONADO_S;
      if (sube) {
        pista.appendChild(entrante);
        gsap.fromTo(pista, { yPercent: 0 }, { yPercent: -50, duration: DIGITO_S, delay: retraso, ease: 'power3.inOut', onComplete: () => cerrarDigito(pista, entrante) });
      } else {
        pista.insertBefore(entrante, pista.firstChild);
        gsap.fromTo(pista, { yPercent: -50 }, { yPercent: 0, duration: DIGITO_S, delay: retraso, ease: 'power3.inOut', onComplete: () => cerrarDigito(pista, entrante) });
      }
    });
  };

  const cerrarDigito = (pista: HTMLElement, glifo: HTMLElement): void => {
    pista.replaceChildren(glifo);
    gsap.set(pista, { clearProps: 'transform' });
  };

  const ponerFlecha = (capitulo: number, cortar: boolean): void => {
    if (!flecha || posicionesAnios.length === 0) return;
    // Un <svg> no tiene `offsetHeight` (daba NaN y GSAP no lo movía): se lee el alto de maquetación del CSS, que
    // no cambia con la escala del paneo como sí cambiaría `getBoundingClientRect()`.
    const alto = parseFloat(getComputedStyle(flecha).height);
    const y = (posicionesAnios[capitulo] ?? 0) - (Number.isFinite(alto) ? alto : 0) / 2;
    if (cortar || c.reducido) gsap.set(flecha, { y });
    else gsap.to(flecha, { y, duration: 0.3, ease: 'power2.out', overwrite: true });
  };

  const cambiarCapitulo = (nuevo: number, instantaneo: boolean): void => {
    const previo = capituloActual;
    capituloActual = nuevo;
    const cap = capitulos[nuevo];
    bloque.setAttribute('data-sm-capitulo-actual', String(nuevo));
    rodarDigitos(cap.digitos, nuevo > previo, instantaneo);
    cambiarRotulo(cap.rotulo, instantaneo);
    relevo(textoEl, cap.texto, 0, instantaneo);
    relevo(extraEl, cap.extra, 1, instantaneo);
    relevo(sabiasEl, cap.sabias, 2, instantaneo);
    if (vivo) vivo.textContent = `Semestre ${cap.id}`;
    botonesAnios.forEach((b, i) => {
      if (i === nuevo) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    if (anterior) anterior.disabled = nuevo === 0;
    ponerFlecha(nuevo, instantaneo);
  };

  // ---------- La película del círculo ----------
  let pelicula: ControladorPelicula | null = null;
  let estadoPelicula: 'espera' | 'cargando' | 'lista' | 'sin-webgl' = 'espera';
  let imagenVisible = 0;

  const marcarFoto = (indice: number): void => {
    fotos.forEach((f, i) => f.setAttribute('data-actual', i === indice ? 'true' : 'false'));
    lienzo.setAttribute('aria-label', imagenes[indice]?.alt ?? '');
  };

  const sinWebGL = (): void => {
    estadoPelicula = 'sin-webgl';
    circulo.setAttribute('data-modo', 'img');
  };

  const cargarPelicula = async (): Promise<void> => {
    estadoPelicula = 'cargando';
    const gl = lienzo.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'default' });
    if (!gl) {
      sinWebGL();
      return;
    }
    try {
      const modulo = await import('@/lib/three/sobre-mi/pelicula');
      if (destruido) return;
      pelicula = modulo.crearPelicula({
        lienzo,
        gl,
        imagenes: imagenes.map((im) => ({ src: im.src, ancho: im.ancho, alto: im.alto })),
        animar: !c.reducido,
        alPerderContexto: () => circulo.setAttribute('data-modo', 'img'),
        alRestaurarContexto: () => circulo.setAttribute('data-modo', 'webgl'),
      });
      estadoPelicula = 'lista';
      circulo.setAttribute('data-modo', 'webgl');
      pelicula.mostrar(imagenVisible, envejecimientoDe(imagenVisible), true);
    } catch {
      pelicula = null;
      sinWebGL();
    }
  };

  /** K16: el desvanecido va de 0,2 (fresca) a 1 (envejecida): la primera imagen es la más vieja. */
  const envejecimientoDe = (indice: number): number => {
    const total = Math.max(1, imagenes.length - 1);
    return mezclar(1, 0.2, indice / total);
  };

  const cambiarParada = (idx: number, inicial: boolean): void => {
    paradaActual = idx;
    const p = paradas[idx];
    bloque.setAttribute('data-sm-parada-actual', String(idx));
    imagenVisible = p.imagen;
    marcarFoto(p.imagen);
    pelicula?.mostrar(p.imagen, envejecimientoDe(p.imagen), c.reducido || inicial, CAMBIO_IMAGEN_S);
    relevo(pieEl, imagenes[p.imagen]?.pie ?? '', 0, c.reducido || inicial);
    if (p.capitulo !== capituloActual) cambiarCapitulo(p.capitulo, c.reducido || inicial);
  };

  // ---------- Los botones ----------
  anterior?.addEventListener('click', () => irA(primeraParadaDe(Math.max(0, capituloActual - 1)), duracionSalto(1)), { signal });
  siguiente?.addEventListener(
    'click',
    () => {
      const destino = capituloActual + 1 < capitulos.length ? primeraParadaDe(capituloActual + 1) : cierreY;
      irA(destino, duracionSalto(1));
    },
    { signal },
  );
  // «Saltar» lleva al cierre (K14): con el paneo hecho, la escena invertida y el interludio entrando.
  saltar?.addEventListener('click', () => irA(Math.round(cierreY + HISTORIA_PANEO * pantalla), SALTO_MAXIMO_S), { signal });
  botonesAnios.forEach((b, i) => b.addEventListener('click', () => irA(primeraParadaDe(i), duracionSalto(Math.abs(i - capituloActual))), { signal }));

  // ---------- El imán (K14) ----------
  let ultimaY = c.y;
  let ultimoCambio = 0;
  let enGesto = false;
  let origenGesto = c.y;
  let picoVelocidad = 0;
  let tocando = false;
  window.addEventListener('wheel', () => (programatico = false), { passive: true, signal });
  window.addEventListener('touchstart', () => ((tocando = true), (programatico = false)), { passive: true, signal });
  window.addEventListener('touchend', () => (tocando = false), { passive: true, signal });
  window.addEventListener('touchcancel', () => (tocando = false), { passive: true, signal });

  const iman = (ctx: Contexto): void => {
    const dy = ctx.y - ultimaY;
    ultimaY = ctx.y;
    if (Math.abs(dy) > 0.01) {
      if (!enGesto) {
        enGesto = true;
        origenGesto = ctx.y - dy;
        picoVelocidad = 0;
      }
      ultimoCambio = ctx.t;
      picoVelocidad = Math.max(picoVelocidad, Math.abs(dy) / Math.max(1, ctx.dt * 1000));
      return;
    }
    if (!enGesto || ctx.t - ultimoCambio < ESPERA_IMAN_S) return;
    if (programatico) {
      programatico = false;
      enGesto = false;
      return;
    }
    // Con el dedo puesto o con un diálogo abierto se espera; el resto de condiciones cancela el gesto.
    if (tocando || document.querySelector('dialog[open]')) return;
    enGesto = false;
    const lenis = obtenerLenis();
    if (pasoEnCurso() || ctx.reducido || !lenis || ctx.nivel() !== 'SM' || paradas.length === 0) return;
    // El imán solo actúa con la historia fijada: desde su entrada hasta donde empieza el cierre.
    if (ctx.y < tope || ctx.y > cierreY + 1) return;

    const puntos = [...paradas.map((p) => p.y), cierreY];
    const cercano = (y: number): number => {
      let mejor = 0;
      puntos.forEach((p, i) => {
        if (Math.abs(p - y) < Math.abs(puntos[mejor] - y)) mejor = i;
      });
      return mejor;
    };
    let destino = cercano(ctx.y);
    const desde = cercano(origenGesto);
    const recorrido = ctx.y - origenGesto;
    const vecina = limitar(desde + Math.sign(recorrido), 0, puntos.length - 1);
    const espaciado = Math.max(1, Math.abs(puntos[vecina] - puntos[desde]));
    // Un gesto rápido que recorrió más del 30 % de la distancia entre paradas: la siguiente en esa dirección,
    // partiendo de la parada donde empezó. Si no, la más cercana.
    // Un salto de más de una distancia entre paradas (un enlace, la barra de scroll) no es un gesto: va a la más cercana.
    if (Math.abs(recorrido) > GESTO_LARGO * espaciado && Math.abs(recorrido) < 1.5 * espaciado && picoVelocidad > GESTO_RAPIDO) destino = vecina;
    const objetivo = puntos[destino];
    if (Math.abs(objetivo - ctx.y) < 1.5) return;
    const duracion = limitar(0.4 + (Math.abs(objetivo - ctx.y) / ctx.alto) * 0.35, 0.4, 0.9);
    lenis.scrollTo(objetivo, { duration: duracion, easing: curvaEntradaSalida });
  };

  // ---------- El cierre y la inversión de la escena (K18) ----------
  let invertida = false;
  let oscuroAplicado = Number.NaN;
  let temaAplicado = '';
  let colores: { pagina: Rgb; invertida: Rgb; primario: Rgb } | null = null;

  const leerColores = (): void => {
    colores = {
      pagina: leerColor(seccion, '--sm-pagina'),
      invertida: leerColor(seccion, '--sm-invertida'),
      primario: leerColor(seccion, '--sm-primario'),
    };
  };

  /** Escribe el fondo de la sección y la tinta de la escena: mezcla entre la página y la página invertida del tema. */
  const aplicarOscuro = (oscuro: number, tema: string): void => {
    if (oscuro === oscuroAplicado && tema === temaAplicado) return;
    oscuroAplicado = oscuro;
    if (tema !== temaAplicado || !colores) {
      temaAplicado = tema;
      leerColores();
    }
    if (!colores) return;
    if (oscuro > 0.0005) {
      seccion.style.backgroundColor = aCss(mezclarColor(colores.pagina, colores.invertida, oscuro));
      // E1 de la auditoría final: la tinta va hacia el color claro del tema (en Día, la página; en Noche, el primario).
      const luz = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      const clara = luz(colores.pagina) >= luz(colores.primario) ? colores.pagina : colores.primario;
      seccion.style.setProperty('--sm-escena-tinta', aCss(mezclarColor(colores.primario, clara, oscuro)));
    } else {
      seccion.style.removeProperty('background-color');
      seccion.style.removeProperty('--sm-escena-tinta');
    }
  };

  const cierre = (ctx: Contexto): void => {
    const s = (ctx.y - cierreY) / ctx.alto;
    // La escena oscura: sube entre OSCURO_SUBE y baja al llegar al contacto.
    let oscuro = suavizado(OSCURO_SUBE[0], OSCURO_SUBE[1], s) * (1 - suavizado(OSCURO_BAJA[0], OSCURO_BAJA[1], s));
    if (ctx.reducido) oscuro = s >= 0.65 && s < 3.2 ? 1 : 0;
    ctx.oscuro = oscuro;
    aplicarOscuro(oscuro, ctx.tema());
    // La histéresis de K18: entra cuando está del todo oscura y sale al empezar a aclararse.
    if (!invertida && oscuro >= INVERTIDA_ENTRA) invertida = true;
    else if (invertida && oscuro < INVERTIDA_SALE) invertida = false;
    const valor = invertida ? 'true' : 'false';
    if (seccion.getAttribute('data-sm-invertida') !== valor) seccion.setAttribute('data-sm-invertida', valor);

    if (interludio) {
      const entra = tramo(INTERLUDIO_ENTRA[0], INTERLUDIO_ENTRA[1], s);
      const sale = tramo(INTERLUDIO_SALE[0], INTERLUDIO_SALE[1], s);
      const opacidad = ctx.reducido ? (s >= 1.2 && s < 3.2 ? 1 : 0) : entra * (1 - sale);
      interludio.style.opacity = opacidad.toFixed(3);
      interludio.style.transform = ctx.reducido ? '' : `translate3d(0, ${((1 - entra) * 24).toFixed(1)}px, 0)`;
      interludio.style.visibility = opacidad < 0.001 ? 'hidden' : '';
    }
    if (ctx.reducido) return;

    // El paneo del escenario (cámara de la historia): la escena se va hacia la izquierda y la estrella queda sola.
    const pan = curvaEntradaSalida(tramo(0, HISTORIA_PANEO, s));
    escena.style.transform = pan > 0 ? `translate3d(${(-pan * ctx.ancho * 1.15).toFixed(1)}px, 0, 0)` : '';
    if (cierreEstrella) {
      const x = mezclar(xEstrellaCierre, ctx.ancho * 0.58, pan);
      cierreEstrella.style.opacity = s > 0 ? '1' : '0';
      cierreEstrella.style.left = `${x.toFixed(1)}px`;
      cierreEstrella.style.rotate = `${(pan * 360).toFixed(1)}deg`;
    }
    if (cierreLinea) cierreLinea.style.opacity = tramo(0.05, 0.6, s).toFixed(3);
    if (estrellaAro) estrellaAro.style.opacity = (1 - tramo(0, 0.06, s)).toFixed(3);
  };

  // ---------- Un cuadro ----------
  const actualizar = (ctx: Contexto): void => {
    if (paradas.length === 0) return;
    const nivel = ctx.nivel();
    // El WebGL de la película se carga cuando la historia se acerca (nunca en el JS inicial de `/`).
    if (estadoPelicula === 'espera' && (nivel === 'SM' || nivel === 'N2') && ctx.y + ctx.alto * PRECARGA_PANTALLAS >= tope) void cargarPelicula();

    const idx = masCercana(ctx.y);
    if (idx !== paradaActual) cambiarParada(idx, paradaActual < 0);

    // El arco de progreso con su estrella (K16).
    const hp = limitar((ctx.y - paradas[0].y) / Math.max(1, cierreY - paradas[0].y), 0, 1);
    if (arco) arco.style.strokeDashoffset = (100 * (1 - hp)).toFixed(2);
    if (estrellaAro) {
      const angulo = -Math.PI / 2 + hp * Math.PI * 2;
      estrellaAro.style.left = `${(50 + 50 * Math.cos(angulo)).toFixed(2)}%`;
      estrellaAro.style.top = `${(50 + 50 * Math.sin(angulo)).toFixed(2)}%`;
      estrellaAro.style.rotate = `${(hp * 540).toFixed(1)}deg`;
    }

    // La corona (K16): cada flor se abre cuando la estrella pasa por ella; la última lo hace antes de la última foto.
    coronaFlores.forEach((flor, i) => {
      const umbral = Math.min((i + 0.5) / coronaFlores.length, avanceUltima);
      const valor = hp >= umbral && hp > 0 ? 'true' : 'false';
      if (flor.getAttribute('data-abierta') !== valor) flor.setAttribute('data-abierta', valor);
    });

    cierre(ctx);
    iman(ctx);

    // La película dibuja solo con la historia en pantalla y la pestaña visible.
    const enPantalla = ctx.y + ctx.alto > tope && ctx.y < tope + altoBloque && nivel === 'SM';
    if (pelicula && enPantalla && !document.hidden && ctx.y < cierreY + ctx.alto * 1.5) pelicula.dibujar(ctx.t);
  };

  // Los semestres, los botones y las fotos de la película parten del primer capítulo.
  marcarFoto(0);

  return {
    medir,
    actualizar,
    destruir: () => {
      destruido = true;
      abort.abort();
      gsap.killTweensOf([escena, banda, flecha, textoEl, extraEl, sabiasEl, pieEl, ...columnas.map((col) => col.querySelector('[data-sm-pista]'))]);
      pelicula?.destruir();
      pelicula = null;
      seccion.style.removeProperty('background-color');
      seccion.style.removeProperty('--sm-escena-tinta');
    },
  };
}
