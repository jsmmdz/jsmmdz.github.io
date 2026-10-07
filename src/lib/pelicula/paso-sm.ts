/**
 * El paso entre el menú (N2) y la sección negra «Sobre mí» (T35, decisión 2 del autor, calcado de cómo
 * Digitalists llega a su contacto): un gesto de la rueda hacia abajo hace subir la sección por encima del
 * N2, con borde recto, sin fundido ni pin; desde el borde de la sección, la rueda hacia arriba baja el N2
 * otra vez. También se llega con el enlace «Sobre mí» (home y HUD del N2) y, desde T36, con el botón
 * «Contacto» del home, que abre la misma sección en el bloque del formulario (`/#contacto`).
 *
 * Sin ScrollTrigger: el movimiento es un `scrollTo` de Lenis (≈ 1,0 s, como la vuelta al home). Con
 * movimiento reducido, o sin Lenis, es un corte.
 */
import { obtenerNavegacion } from '@/lib/navigation/instancia';
import type { SmAncla } from '@/lib/navigation/types';
import { obtenerLenis } from './lenis';
import { BORDE_SECCION_PX, atenderGesto, clasificarRueda, empiezaGesto, fijarPasoEnCurso, pasoEnCurso, registrarRueda } from './estado-paso';

/** Lo que dura el paso suave: lo mismo que la vuelta del N2 al home. */
const DURACION_PASO_S = 1.0;
/** Duración del ajuste hasta el borde de la sección cuando un gesto lo cruzaría. */
const DURACION_AJUSTE_S = 0.5;
/** Toda espera tiene salida: si Lenis no avisa que terminó, el paso se da por terminado. */
const RESPALDO_PASO_MS = 1800;
/** La misma regla de la rueda del N2: un gesto vale desde |Δ| ≥ 20 y no más de uno cada 350 ms. */
const UMBRAL_RUEDA = 20;
const REPOSO_RUEDA_MS = 350;
/** Cuánto se espera a que la página deje de moverse antes de asentarla (dedo o barra de scroll). */
const ESPERA_ASENTAR_MS = 180;
/** Cuánto se puede pasar el N2 hacia la sección antes de contarlo como intención de bajar. */
const TOLERANCIA_ASENTAR_PX = 24;

const movimientoReducido = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const nivelActual = (): string => document.body.dataset.currentLevel ?? '';
const seccionSm = (): HTMLElement | null => document.getElementById('act-sm');
const actN2 = (): HTMLElement | null => document.getElementById('act-n2');
const topeAbsoluto = (el: HTMLElement): number => el.getBoundingClientRect().top + window.scrollY;

/** El borde que queda arriba de la pantalla: el de la sección, o el del bloque del formulario (`/#contacto`). */
export function destinoDeAncla(seccion: HTMLElement, ancla: SmAncla): HTMLElement {
  if (ancla === 'contacto') return seccion.querySelector<HTMLElement>('[data-sm="contacto"]') ?? seccion;
  return seccion;
}

/**
 * Lleva el borde superior de `destino` al borde superior de la pantalla y avisa al terminar.
 * Mientras corre, `pasoEnCurso()` es verdadero y ningún gesto mueve la página.
 */
function llevarA(destino: HTMLElement, duracionS: number, alTerminar: () => void): void {
  fijarPasoEnCurso(true);
  const lenis = obtenerLenis();
  let terminado = false;
  let respaldo: number | undefined;

  const terminar = (): void => {
    if (terminado) return;
    terminado = true;
    if (respaldo !== undefined) window.clearTimeout(respaldo);
    // Si el paso quedó a unos píxeles (Lenis se interrumpió, el respaldo saltó), se corrige.
    const resto = destino.getBoundingClientRect().top;
    if (Math.abs(resto) > 1) window.scrollTo({ top: window.scrollY + resto, behavior: 'instant' });
    fijarPasoEnCurso(false);
    alTerminar();
  };

  if (!lenis || movimientoReducido()) {
    window.scrollTo({ top: topeAbsoluto(destino), behavior: 'instant' });
    terminar();
    return;
  }
  // La sección acaba de dibujarse (o de crecer el documento): Lenis tiene que conocer el largo real.
  lenis.resize();
  respaldo = window.setTimeout(terminar, RESPALDO_PASO_MS);
  lenis.scrollTo(destino, { duration: duracionS, onComplete: terminar });
}

/**
 * Sube la sección «Sobre mí». Desde el N2: paso suave y el nivel cambia a `SM` al terminar (`rueda` reemplaza
 * la entrada del historial; `enlace` agrega una, para que «atrás» vuelva). Desde el home (solo con enlace):
 * corte directo, sin pasar por el menú.
 */
export function irASobreMi(via: 'rueda' | 'enlace', ancla: SmAncla = 'sobre-mi'): boolean {
  const seccion = seccionSm();
  if (!seccion || pasoEnCurso()) return false;
  const nav = obtenerNavegacion();
  const estado = nav.getState();

  if (estado.currentLevel === 'N1') {
    if (!nav.transition({ type: 'ENTER_SM', via: 'enlace', ancla })) return false;
    // El nivel ya es SM y la sección ya ocupa lugar: el destino se mide después del cambio.
    window.scrollTo({ top: topeAbsoluto(destinoDeAncla(seccion, ancla)), behavior: 'instant' });
    return true;
  }
  if (estado.currentLevel !== 'N2' || estado.isTransitioning) return false;

  llevarA(destinoDeAncla(seccion, ancla), DURACION_PASO_S, () => {
    if (!nav.transition({ type: 'ENTER_SM', via, ancla })) {
      // Un giro del menú sostenía el bloqueo: se libera y se reintenta para no dejar la sección sin nivel.
      nav.completeTransition();
      nav.transition({ type: 'ENTER_SM', via, ancla });
    }
  });
  return true;
}

/** Desde el borde de la sección: el nivel pasa a N2 al empezar (para que el menú se vea mientras baja). */
export function volverAlN2(): boolean {
  const n2 = actN2();
  if (!n2 || pasoEnCurso()) return false;
  const nav = obtenerNavegacion();
  if (nav.getState().currentLevel !== 'SM') return false;
  // El bloqueo va antes del cambio de nivel: los suscriptores de `scroll.ts` no deben alinear de golpe.
  fijarPasoEnCurso(true);
  if (!nav.transition({ type: 'EXIT_SM' })) {
    fijarPasoEnCurso(false);
    return false;
  }
  llevarA(n2, DURACION_PASO_S, () => undefined);
  return true;
}

/** Detiene la página en el borde de la sección (un gesto hacia arriba lo cruzaría sin ser el gesto de volver). */
function ajustarAlBorde(ancla: SmAncla = 'sobre-mi'): void {
  const seccion = seccionSm();
  if (!seccion) return;
  const destino = destinoDeAncla(seccion, ancla);
  const lenis = obtenerLenis();
  if (lenis && !movimientoReducido()) {
    lenis.scrollTo(destino, { duration: DURACION_AJUSTE_S });
  } else {
    window.scrollTo({ top: topeAbsoluto(destino), behavior: 'instant' });
  }
}

/** Sube al home con el mismo movimiento que la rueda del N2 (N2Menu.astro). */
function subirAlHome(): void {
  const lenis = obtenerLenis();
  if (lenis && !movimientoReducido()) lenis.scrollTo(0, { duration: DURACION_PASO_S });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * Red de seguridad para lo que no es la rueda (el dedo, la barra de scroll, un salto del navegador): la
 * página no se queda a medio camino entre el N2 y la sección. Se llama desde el escucha de scroll de la
 * película.
 */
let temporizadorAsentar: number | undefined;

function asentar(): void {
  temporizadorAsentar = undefined;
  if (pasoEnCurso() || nivelActual() !== 'N2') return;
  const n2 = actN2();
  if (!n2) return;
  // Con el teclado (Tab) el navegador trae a la vista un elemento de la sección: el nivel pasa a SM sin
  // mover la página, o el foco quedaría fuera de la pantalla (auditoría final, E3). El bloqueo evita que
  // `scroll.ts` alinee la sección arriba al cambiar de nivel.
  const seccion = seccionSm();
  const foco = document.activeElement;
  if (seccion && foco instanceof HTMLElement && foco !== seccion && seccion.contains(foco) && seccion.getBoundingClientRect().top < window.innerHeight) {
    fijarPasoEnCurso(true);
    const nav = obtenerNavegacion();
    if (!nav.transition({ type: 'ENTER_SM', via: 'rueda' })) {
      nav.completeTransition();
      nav.transition({ type: 'ENTER_SM', via: 'rueda' });
    }
    fijarPasoEnCurso(false);
    return;
  }
  const pasado = -n2.getBoundingClientRect().top;
  if (pasado <= TOLERANCIA_ASENTAR_PX) return;
  if (pasado > window.innerHeight * 0.3) irASobreMi('rueda');
  else window.scrollTo({ top: topeAbsoluto(n2), behavior: 'instant' });
}

export function reconciliarPorScroll(): void {
  if (pasoEnCurso()) return;
  const nivel = nivelActual();
  if (nivel === 'SM') {
    const seccion = seccionSm();
    // Con la sección ya más abajo que la mitad de la pantalla, lo que se ve es el menú: el nivel lo sigue.
    if (seccion && seccion.getBoundingClientRect().top > window.innerHeight * 0.5) {
      obtenerNavegacion().transition({ type: 'EXIT_SM' });
    }
    return;
  }
  if (nivel === 'N2') {
    if (temporizadorAsentar !== undefined) window.clearTimeout(temporizadorAsentar);
    temporizadorAsentar = window.setTimeout(asentar, ESPERA_ASENTAR_MS);
  }
}

/** Suelta lo pendiente al destruir la película. */
export function soltarPasoSm(): void {
  if (temporizadorAsentar !== undefined) {
    window.clearTimeout(temporizadorAsentar);
    temporizadorAsentar = undefined;
  }
  fijarPasoEnCurso(false);
}

const TECLAS_BAJAR = new Set([' ', 'PageDown', 'End', 'ArrowDown']);
const TECLAS_SUBIR = new Set(['PageUp', 'Home', 'ArrowUp']);

/**
 * Los escuchas del paso: el enlace «Sobre mí», la rueda dentro de la sección y el teclado en el N2. Todos
 * se sueltan con la señal.
 */
export function instalarPasoSm(signal: AbortSignal): void {
  let ultimaRueda = 0;

  // Antes que cualquier otro escucha de la rueda (el del N2, el de la sección y Lenis): lleva la cuenta de
  // los gestos para que la cola de uno no cruce dos niveles (auditoría final, E1 y E2).
  // La hora del evento, no la de cuando se atiende: con la página ocupada, un gesto no se parte en dos.
  window.addEventListener('wheel', (e) => registrarRueda(e, e.timeStamp), { capture: true, passive: true, signal });

  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href$="#sobre-mi"], a[href$="#contacto"]');
      if (!enlace) return;
      if (!seccionSm()) return;
      e.preventDefault();
      const ancla: SmAncla = enlace.getAttribute('href')?.endsWith('#contacto') ? 'contacto' : 'sobre-mi';
      const nivel = nivelActual();
      if (nivel === 'N1' || nivel === 'N2') irASobreMi('enlace', ancla);
      else if (nivel === 'SM') ajustarAlBorde(ancla);
    },
    { signal },
  );

  // Dentro de la sección la rueda es de Lenis, salvo en el borde de arriba y en el paso en curso.
  window.addEventListener(
    'wheel',
    (e) => {
      const clase = clasificarRueda(e.deltaY);
      if (clase === 'libre') {
        // Una rueda hacia arriba que recorre la sección cuenta como gesto en curso: al llegar al borde la
        // misma ráfaga no debe contarse como el gesto de volver.
        if (e.deltaY < 0 && nivelActual() === 'SM') ultimaRueda = performance.now();
        return;
      }
      if (nivelActual() !== 'SM' && !pasoEnCurso()) return; // el N2 atiende la suya (N2Menu.astro)
      if (e.cancelable) e.preventDefault();
      atenderGesto(e);
      if (clase === 'ajustar') {
        // Llegar al borde con la rueda no es el gesto de volver: la siguiente rueda espera el reposo.
        ultimaRueda = performance.now();
        ajustarAlBorde();
      } else if (clase === 'volver') {
        const ahora = performance.now();
        if (Math.abs(e.deltaY) < UMBRAL_RUEDA || ahora - ultimaRueda < REPOSO_RUEDA_MS || !empiezaGesto()) return;
        ultimaRueda = ahora;
        volverAlN2();
      }
    },
    { passive: false, signal },
  );

  window.addEventListener(
    'keydown',
    (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const destino = e.target as HTMLElement | null;
      // Un campo, un botón o un enlace se quedan con sus teclas (Espacio activa el botón).
      if (destino?.closest('button, a, input, textarea, select, [contenteditable]')) return;
      const nivel = nivelActual();
      const sube = TECLAS_SUBIR.has(e.key) || (e.key === ' ' && e.shiftKey);
      const baja = TECLAS_BAJAR.has(e.key) && !(e.key === ' ' && e.shiftKey);
      if (!sube && !baja) return;

      if (nivel === 'N2') {
        // Sin esto, estas teclas dejarían la página a medio camino entre el menú y la sección.
        e.preventDefault();
        if (pasoEnCurso()) return;
        if (baja) irASobreMi('rueda');
        else subirAlHome();
      } else if (nivel === 'SM' && sube) {
        if (pasoEnCurso()) {
          e.preventDefault();
          return;
        }
        const seccion = seccionSm();
        if (!seccion) return;
        const tope = seccion.getBoundingClientRect().top;
        if (tope >= -BORDE_SECCION_PX) {
          e.preventDefault();
          volverAlN2();
        } else if (e.key === 'Home' || -tope < window.innerHeight) {
          e.preventDefault();
          ajustarAlBorde();
        }
      }
    },
    { signal },
  );
}
