/**
 * Controlador de scroll y navegación continua para la película (N1 ↔ N2, y la sección «Sobre mí» debajo).
 * Satisface los contratos de T19 y D11 (un solo enlace continuo). El paso N2 ↔ sección (T35) está en
 * `paso-sm.ts`.
 */
import { obtenerNavegacion } from '@/lib/navigation/instancia';
import { notificarProgresoCaida } from './caida-hook';
import { obtenerLenis } from './lenis';
import { pasoEnCurso } from './estado-paso';
import { destinoDeAncla, instalarPasoSm, reconciliarPorScroll, soltarPasoSm } from './paso-sm';

/** Toda espera tiene salida: el re-alineado de /#contacto no dura más que esto. */
const REALINEAR_HASTA_MS = 3000;

/**
 * Mantiene `destino` arriba mientras la página termina de cargar: cada vez que cambia el alto de lo que hay
 * sobre él se vuelve a alinear, hasta que el visitante mueve la página (rueda, dedo o teclado) o pasa el
 * tiempo máximo.
 */
function mantenerAlineado(destino: HTMLElement, alinear: () => void, signal: AbortSignal): void {
  const raiz = destino.closest('#act-sm') ?? destino;
  const observador = new ResizeObserver(alinear);
  observador.observe(raiz);
  const soltar = (): void => {
    observador.disconnect();
    window.clearTimeout(limite);
    for (const tipo of ['wheel', 'touchstart', 'keydown'] as const) window.removeEventListener(tipo, soltar);
  };
  const limite = window.setTimeout(soltar, REALINEAR_HASTA_MS);
  for (const tipo of ['wheel', 'touchstart', 'keydown'] as const) window.addEventListener(tipo, soltar, { passive: true, once: true });
  signal.addEventListener('abort', soltar, { once: true });
}

/**
 * Al entrar a la sección, el foco entra con el visitante (auditoría final de T36, E1): si no está ya dentro,
 * pasa al destino (la sección o el bloque del formulario, con tabindex="-1") sin mover la página. Si se
 * quedara en <body>, el Tab siguiente llevaría al menú y sacaría al visitante de la sección.
 */
function enfocarAlEntrar(seccion: HTMLElement, destino: HTMLElement): void {
  const foco = document.activeElement;
  if (foco instanceof HTMLElement && seccion.contains(foco)) return;
  destino.focus({ preventScroll: true });
}

let abortController: AbortController | null = null;
let desuscribirNav: (() => void) | null = null;
let actN1Iniciado: HTMLElement | null = null;

export function inicializarPelicula(): void {
  const actN1 = document.getElementById('act-n1');
  const actN2 = document.getElementById('act-n2');

  // Si no estamos en la página de la película con N1 y N2, no hacer nada
  if (!actN1 || !actN2) return;

  // Idempotente: si ya arrancó para esta página (el mismo #act-n1), no arranca otra vez.
  // El módulo corre al cargar y `astro:page-load` llega después: sin esto se iniciaba dos veces.
  if (abortController && actN1Iniciado === actN1) return;

  // Limpiar instancias de una página anterior antes de reiniciar
  destruirPelicula();
  actN1Iniciado = actN1;

  abortController = new AbortController();
  const { signal } = abortController;
  const nav = obtenerNavegacion();

  let navegandoSuave = false;

  // Interceptar clic en enlace hacia #disciplinas para scroll suave y ejecución de la caída (T25)
  document.addEventListener(
    'click',
    (e) => {
      const target = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>('a[href="#disciplinas"]');
      if (target) {
        e.preventDefault();
        navegandoSuave = true;
        nav.transition({ type: 'SCROLL_DROP' });
        const lenis = obtenerLenis();
        if (lenis) {
          lenis.scrollTo(actN2, { duration: 1.2 });
        } else {
          actN2.scrollIntoView({ behavior: 'smooth' });
        }
      }
    },
    { signal }
  );

  const actSm = document.getElementById('act-sm');
  instalarPasoSm(signal);

  // Si arranca en N2 (por ejemplo, acceso directo a /disciplinas/ o /#web), posicionar e hidratar de inmediato
  const hash = window.location.hash.replace('#', '');
  const esDisciplineHash = ['web', 'motion', '3d', 'videojuegos', 'editorial', 'disciplinas'].includes(hash);
  const esNivelN2Inicial =
    document.body.dataset.currentLevel === 'N2' ||
    esDisciplineHash;

  // Enlace directo a /#sobre-mi (T35) o a /#contacto (T36): la sección abre arriba, o con el bloque del
  // formulario arriba, y el preloader es corto como en /#web.
  if ((hash === 'sobre-mi' || hash === 'contacto') && actSm) {
    nav.hydrateFromUrl(window.location.pathname + window.location.hash);
    document.body.dataset.currentLevel = 'SM';
    const preloader = document.getElementById('act-n0');
    if (preloader) {
      preloader.style.display = 'none';
      preloader.setAttribute('hidden', '');
    }
    const destino = destinoDeAncla(actSm, hash);
    const alinearSm = () => {
      window.scrollTo({ top: destino.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
    };
    alinearSm();
    requestAnimationFrame(alinearSm);
    setTimeout(alinearSm, 60);
    // El bloque del formulario queda al final de una sección larga: si algo de arriba cambia de alto al cargar
    // (una imagen, la fuente), se vuelve a alinear, hasta que el visitante toque la página o pasen 3 s.
    if (hash === 'contacto') mantenerAlineado(destino, alinearSm, signal);
    enfocarAlEntrar(actSm, destino);
  } else if (esNivelN2Inicial) {
    if (esDisciplineHash) {
      nav.hydrateFromUrl(window.location.pathname + window.location.hash);
      document.body.dataset.currentLevel = 'N2';
      const preloader = document.getElementById('act-n0');
      if (preloader) {
        preloader.style.display = 'none';
        preloader.setAttribute('hidden', '');
      }
    }
    const alinearN2 = () => {
      actN2.scrollIntoView({ behavior: 'instant' });
      window.scrollTo({ top: actN2.offsetTop, behavior: 'instant' });
    };
    alinearN2();
    requestAnimationFrame(alinearN2);
    setTimeout(alinearN2, 60);
  }

  // Sincronizar alineación ante cambios de estado de nivel de la máquina (ej. popstate o navegación sin recarga)
  let nivelPrevio = '';
  let anclaPrevia = '';
  desuscribirNav = nav.subscribe((estado) => {
    const entraASm = estado.currentLevel !== nivelPrevio || estado.smAncla !== anclaPrevia;
    nivelPrevio = estado.currentLevel;
    anclaPrevia = estado.smAncla;
    if (entraASm && estado.currentLevel === 'SM' && actSm) enfocarAlEntrar(actSm, destinoDeAncla(actSm, estado.smAncla));
    // Durante el paso suave N2 ↔ sección (T35) la página se mueve sola: no se alinea de golpe.
    if (navegandoSuave || pasoEnCurso()) return;
    if (estado.currentLevel === 'SM') {
      // Adelante/atrás del navegador y enlaces: la sección queda arriba (corte), o el bloque del formulario si se
      // llegó por /#contacto (el botón del home lo hace el router de Astro, que antes de llegar aquí ya movió
      // la dirección). Solo al entrar: dentro de la sección el visitante se mueve libre.
      if (!entraASm || !actSm) return;
      const destino = destinoDeAncla(actSm, estado.smAncla);
      const rect = destino.getBoundingClientRect();
      if (Math.abs(rect.top) > 50) {
        window.scrollTo({ top: rect.top + window.scrollY, behavior: 'instant' });
      }
    } else if (estado.currentLevel === 'N2') {
      const rect = actN2.getBoundingClientRect();
      if (Math.abs(rect.top) > 50) {
        actN2.scrollIntoView({ behavior: 'instant' });
      }
    } else if (estado.currentLevel === 'N1') {
      const rect = actN1.getBoundingClientRect();
      if (Math.abs(rect.top) > 50) {
        actN1.scrollIntoView({ behavior: 'instant' });
      }
    }
  });

  // Seguimiento del progreso entre N1 y N2 amarrado al scroll (T25)
  const reportarProgreso = () => {
    const altura = window.innerHeight || 900;
    const scrollActual = window.scrollY || document.documentElement.scrollTop;
    const progreso = Math.max(0, Math.min(1, scrollActual / altura));
    notificarProgresoCaida(progreso);

    const estadoActual = nav.getState();
    if (progreso >= 0.98 && estadoActual.currentLevel === 'N1') {
      nav.transition({ type: 'SCROLL_DROP' });
    } else if (progreso <= 0.05 && estadoActual.currentLevel === 'N2' && !navegandoSuave) {
      nav.transition({ type: 'SCROLL_UP' });
    }

    if (progreso >= 0.95) {
      navegandoSuave = false;
    }

    // Si la sección «Sobre mí» y el N2 quedan a medio camino (dedo, barra de scroll), el nivel los sigue.
    reconciliarPorScroll();
  };

  window.addEventListener('scroll', reportarProgreso, { passive: true, signal });
  reportarProgreso();
}

export function destruirPelicula(): void {
  actN1Iniciado = null;
  soltarPasoSm();
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  if (desuscribirNav) {
    desuscribirNav();
    desuscribirNav = null;
  }
}

// Conectar con el ciclo de vida de Astro ClientRouter
if (typeof document !== 'undefined') {
  document.addEventListener('astro:page-load', inicializarPelicula);
  document.addEventListener('astro:before-swap', destruirPelicula);

  if (document.readyState !== 'loading') {
    inicializarPelicula();
  } else {
    document.addEventListener('DOMContentLoaded', inicializarPelicula, { once: true });
  }
}
