import { NavigationMachine, isValidDisciplineSlug } from './machine';
import { isValidLevel, type TransitionTrigger } from './types';

declare global {
  interface Window {
    __navMachineInstance?: NavigationMachine;
  }
}

// Única instancia de la máquina de navegación del sitio. Cada acto la pide aquí en vez de
// crear la suya: dos máquinas serían dos verdades sobre el nivel activo.
let instancia: NavigationMachine | null = typeof window !== 'undefined' ? (window.__navMachineInstance ?? null) : null;

export function obtenerNavegacion(): NavigationMachine {
  if (instancia) {
    const estado = instancia.getState();
    document.body.dataset.currentLevel = estado.currentLevel;
    document.body.dataset.discipline = estado.activeDiscipline ?? 'web';
    document.body.dataset.project = estado.activeProject ?? '';
    document.body.dataset.transitioning = estado.isTransitioning ? 'true' : 'false';
    return instancia;
  }

  const { currentLevel, discipline, project } = document.body.dataset;
  const nueva = new NavigationMachine({
    currentLevel: isValidLevel(currentLevel) ? currentLevel : 'N0',
    activeDiscipline: isValidDisciplineSlug(discipline) ? discipline : 'web',
    activeProject: project || null,
  });

  // Contrato con los tokens activos (docs/2-TECNICO.md): el <body> refleja el estado y el tema
  // cambia solo. Sin esto, cambiar de nivel no cambiaba ningún color.
  nueva.subscribe((estado) => {
    const nivelActualBody = document.body.dataset.currentLevel;
    const esTransicionRuta = estado.isTransitioning && (
      (nivelActualBody === 'N2' && estado.currentLevel === 'N3') ||
      (nivelActualBody === 'N3' && estado.currentLevel === 'N4') ||
      (nivelActualBody === 'N4' && estado.currentLevel === 'N3') ||
      (nivelActualBody === 'N3' && estado.currentLevel === 'N2')
    );

    if (!esTransicionRuta) {
      document.body.dataset.currentLevel = estado.currentLevel;
    }
    document.body.dataset.discipline = estado.activeDiscipline ?? 'web';
    document.body.dataset.project = estado.activeProject ?? '';
    document.body.dataset.transitioning = estado.isTransitioning ? 'true' : 'false';
  });

  window.addEventListener('popstate', () => {
    nueva.transition({ type: 'POPSTATE', urlPath: window.location.pathname + window.location.hash });
  });

  document.addEventListener('astro:page-load', () => {
    nueva.hydrateFromUrl(window.location.pathname + window.location.hash);
  });

  instancia = nueva;
  if (typeof window !== 'undefined') {
    window.__navMachineInstance = nueva;
  }
  return nueva;
}

export interface TransicionEnCurso {
  aceptada: boolean;
  completar: () => void;
}

/**
 * Inicia una transición con salida garantizada: si nadie llama a `completar()` antes de
 * `respaldoMs`, la máquina se libera sola (reglas § 5: toda espera tiene salida). Sin esto,
 * un video que no dispara `ended` bloquea la navegación para siempre.
 */
export function transicionConRespaldo(trigger: TransitionTrigger, respaldoMs: number): TransicionEnCurso {
  const nav = obtenerNavegacion();
  const aceptada = nav.transition(trigger);
  let temporizador: number | undefined;
  let hecho = false;
  const completar = () => {
    if (hecho) return;
    hecho = true;
    if (temporizador !== undefined) window.clearTimeout(temporizador);
    nav.completeTransition();
  };
  if (aceptada) temporizador = window.setTimeout(completar, respaldoMs);
  else hecho = true;
  return { aceptada, completar };
}
