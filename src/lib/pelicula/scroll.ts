/**
 * Controlador de scroll y navegación continua para la película (N1 ↔ N2).
 * Satisface los contratos de T19 y D11 (un solo enlace continuo).
 */
import { obtenerNavegacion } from '@/lib/navigation/instancia';
import { notificarProgresoCaida } from './caida-hook';
import { obtenerLenis } from './lenis';

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

  // Si arranca en N2 (por ejemplo, acceso directo a /disciplinas/ o /#web), posicionar e hidratar de inmediato
  const hash = window.location.hash.replace('#', '');
  const esDisciplineHash = ['web', 'motion', '3d', 'videojuegos', 'editorial', 'disciplinas'].includes(hash);
  const esNivelN2Inicial =
    document.body.dataset.currentLevel === 'N2' ||
    esDisciplineHash;

  if (esNivelN2Inicial) {
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
  desuscribirNav = nav.subscribe((estado) => {
    if (navegandoSuave) return;
    if (estado.currentLevel === 'N2') {
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
  };

  window.addEventListener('scroll', reportarProgreso, { passive: true, signal });
  reportarProgreso();
}

export function destruirPelicula(): void {
  actN1Iniciado = null;
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
