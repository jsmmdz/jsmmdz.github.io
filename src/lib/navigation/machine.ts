import { conBase } from '@/lib/rutas';
import { SOBRE_MI_VISIBLE } from '@/lib/sobre-mi/visible';
import type {
  Level,
  SmAncla,
  DisciplineSlug,
  NavigationState,
  TransitionTrigger,
  LegalTransitionRule
} from './types';

export const ORDERED_DISCIPLINES: readonly DisciplineSlug[] = [
  'web',
  'motion',
  '3d',
  'videojuegos',
  'editorial'
] as const;

export function isValidDisciplineSlug(slug: unknown): slug is DisciplineSlug {
  return typeof slug === 'string' && (ORDERED_DISCIPLINES as readonly string[]).includes(slug);
}

/**
 * Matriz de transiciones permitidas.
 * Cualquier salto fuera de esta matriz es bloqueado para proteger la integridad cinemática.
 */
export const LEGAL_TRANSITIONS: LegalTransitionRule[] = [
  { from: 'N0', to: 'N1', requiresBlackHinge: false, description: 'Preloader morphing hacia Home' },
  { from: 'N1', to: 'N2', requiresBlackHinge: false, description: 'La caída hacia el menú circular' },
  { from: 'N2', to: 'N2', requiresBlackHinge: false, description: 'Rueda entre disciplinas (dispara video de transición)' },
  { from: 'N2', to: 'N3', requiresBlackHinge: true, description: 'Entrar al mundo 3D (bisagra de negro absoluto)' },
  { from: 'N3', to: 'N4', requiresBlackHinge: true, description: 'Desplegar caso de estudio de una pieza' },
  { from: 'N4', to: 'N3', requiresBlackHinge: true, description: 'Botón volver: de caso de estudio al plano infinito' },
  { from: 'N3', to: 'N2', requiresBlackHinge: true, description: 'Botón volver: del plano infinito al menú circular' },
  { from: 'N2', to: 'N1', requiresBlackHinge: false, description: 'Subir del menú circular al Home' },
  { from: 'N2', to: 'SM', requiresBlackHinge: false, description: 'La sección negra «Sobre mí» sube por encima del menú' },
  { from: 'SM', to: 'N2', requiresBlackHinge: false, description: 'Desde el borde de la sección, la rueda baja el menú otra vez' },
  { from: 'N1', to: 'SM', requiresBlackHinge: false, description: 'El enlace «Sobre mí» del home (corte, sin pasar por el menú)' }
];

export class NavigationMachine {
  private state: NavigationState;
  private listeners: Set<(state: NavigationState) => void> = new Set();

  constructor(initialState?: Partial<NavigationState>) {
    this.state = {
      currentLevel: initialState?.currentLevel ?? 'N0',
      activeDiscipline: initialState?.activeDiscipline ?? 'web',
      activeProject: initialState?.activeProject ?? null,
      smAncla: initialState?.smAncla ?? 'sobre-mi',
      isTransitioning: false,
      canGoBack: false,
      historyAction: 'none'
    };
    this.updateCanGoBack();
  }

  public getState(): Readonly<NavigationState> {
    return { ...this.state };
  }

  public subscribe(listener: (state: NavigationState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => listener(currentState));
  }

  private updateCanGoBack(): void {
    // Solo N3 y N4 tienen botón de volver en la esquina superior
    this.state.canGoBack = this.state.currentLevel === 'N4' || this.state.currentLevel === 'N3';
  }

  /**
   * Valida si la transición entre niveles es legal
   */
  public canTransition(from: Level, to: Level): boolean {
    if (from === to && from === 'N2') return true; // Ciclar disciplinas dentro de N2
    return LEGAL_TRANSITIONS.some((rule) => rule.from === from && rule.to === to);
  }

  /**
   * Resuelve el siguiente o anterior slug de disciplina en el orden circular estricto
   */
  public getAdjacentDiscipline(current: DisciplineSlug, direction: 'next' | 'prev'): DisciplineSlug {
    const currentIndex = ORDERED_DISCIPLINES.indexOf(current);
    if (currentIndex === -1) return 'web';

    if (direction === 'next') {
      const nextIndex = (currentIndex + 1) % ORDERED_DISCIPLINES.length;
      return ORDERED_DISCIPLINES[nextIndex];
    } else {
      const prevIndex = (currentIndex - 1 + ORDERED_DISCIPLINES.length) % ORDERED_DISCIPLINES.length;
      return ORDERED_DISCIPLINES[prevIndex];
    }
  }

  /**
   * Despachador determinista de transiciones
   */
  public transition(trigger: TransitionTrigger): boolean {
    // Si ya hay una transición en curso, bloquea nuevos disparos excepto eventos de hidratación o historial
    if (this.state.isTransitioning && trigger.type !== 'POPSTATE' && trigger.type !== 'DEEP_LINK_HYDRATE') {
      console.warn('[NavigationMachine] Transición bloqueada por estar en progreso:', trigger);
      return false;
    }

    let targetLevel: Level = this.state.currentLevel;
    let targetDiscipline = this.state.activeDiscipline;
    let targetProject = this.state.activeProject;
    let targetAncla: SmAncla = this.state.smAncla;
    let historyAction: 'replaceState' | 'pushState' | 'none' = 'none';
    let setsTransitionLock = false;

    switch (trigger.type) {
      case 'PRELOAD_COMPLETE':
        if (this.state.currentLevel !== 'N0') return false;
        targetLevel = 'N1';
        historyAction = 'replaceState';
        setsTransitionLock = false;
        break;

      case 'SCROLL_DROP':
        if (this.state.currentLevel !== 'N1') return false;
        targetLevel = 'N2';
        targetDiscipline = targetDiscipline ?? 'web';
        setsTransitionLock = false;
        historyAction = 'replaceState';
        break;

      case 'SCROLL_UP':
        if (this.state.currentLevel !== 'N2') return false;
        targetLevel = 'N1';
        targetDiscipline = 'web';
        historyAction = 'replaceState';
        setsTransitionLock = false;
        break;

      case 'ENTER_SM':
        // Desde el N2 (rueda o enlace del HUD) o desde el home (enlace). Con la rueda se reemplaza la
        // entrada del historial, como N1 <-> N2; con el enlace se agrega una, para que «atrás» vuelva.
        if (this.state.currentLevel !== 'N1' && this.state.currentLevel !== 'N2') return false;
        if (trigger.via === 'rueda' && this.state.currentLevel !== 'N2') return false;
        targetLevel = 'SM';
        targetProject = null;
        // El botón «Contacto» del home abre la sección en el bloque del formulario (T36, /#contacto).
        targetAncla = trigger.ancla ?? 'sobre-mi';
        historyAction = trigger.via === 'enlace' ? 'pushState' : 'replaceState';
        setsTransitionLock = false;
        break;

      case 'EXIT_SM':
        if (this.state.currentLevel !== 'SM') return false;
        targetLevel = 'N2';
        targetDiscipline = targetDiscipline ?? 'web';
        historyAction = 'replaceState';
        setsTransitionLock = false;
        break;

      case 'CYCLE_DISCIPLINE':
        if (this.state.currentLevel !== 'N2') return false;
        targetLevel = 'N2';
        targetDiscipline = trigger.targetDiscipline ??
          this.getAdjacentDiscipline(this.state.activeDiscipline ?? 'web', trigger.direction);
        historyAction = 'replaceState'; // Reemplaza en N2 para no ensuciar el historial
        setsTransitionLock = true;
        break;

      case 'ENTER_WORLD':
        if (this.state.currentLevel !== 'N2') return false;
        targetLevel = 'N3';
        targetDiscipline = trigger.discipline;
        targetProject = null;
        historyAction = 'none'; // ClientRouter maneja la navegación a /disciplinas/${slug}/
        setsTransitionLock = true;
        break;

      case 'SELECT_PROJECT':
        if (this.state.currentLevel !== 'N3') return false;
        targetLevel = 'N4';
        targetProject = trigger.projectSlug;
        historyAction = 'none'; // ClientRouter maneja la navegación al proyecto
        setsTransitionLock = true;
        break;

      case 'BACK_BUTTON_CLICK':
        if (this.state.currentLevel === 'N4') {
          targetLevel = 'N3';
          targetProject = null;
          historyAction = 'none'; // ClientRouter maneja la navegación de vuelta a N3
          setsTransitionLock = true;
        } else if (this.state.currentLevel === 'N3') {
          targetLevel = 'N2';
          historyAction = 'none'; // ClientRouter maneja la navegación de vuelta a N2
          setsTransitionLock = true;
        } else {
          return false;
        }
        break;

      case 'POPSTATE':
        // Desencadenado por botón Atrás/Adelante del navegador; no bloquea
        this.hydrateFromUrl(trigger.urlPath);
        return true;

      case 'DEEP_LINK_HYDRATE':
        targetLevel = trigger.level;
        targetDiscipline = trigger.discipline ?? 'web';
        targetProject = trigger.projectSlug ?? null;
        historyAction = 'none';
        setsTransitionLock = false;
        break;

      default:
        return false;
    }

    if (trigger.type !== 'DEEP_LINK_HYDRATE' && !this.canTransition(this.state.currentLevel, targetLevel)) {
      console.warn(`[NavigationMachine] Transición ilegal bloqueada: ${this.state.currentLevel} -> ${targetLevel}`);
      return false;
    }

    this.state = {
      ...this.state,
      currentLevel: targetLevel,
      activeDiscipline: targetDiscipline,
      activeProject: targetProject,
      smAncla: targetAncla,
      isTransitioning: setsTransitionLock,
      historyAction
    };

    this.updateCanGoBack();
    this.syncBrowserUrl(historyAction);
    this.notify();
    return true;
  }

  /**
   * Libera el bloqueo de transición y notifica a los suscriptores.
   * 
   * QUIÉN LA LLAMA:
   * - En N2 (giro entre disciplinas): el script de `N2Menu.astro`, al asentarse el giro o al
   *   empezar a reproducirse el clip de transición.
   * - En N2->N3, N3->N4, N4->N3, N3->N2: `transicionConRespaldo` (instancia.ts) la llama sola a los
   *   1200 ms si nadie lo hizo antes, para que ninguna espera quede sin salida.
   */
  public completeTransition(): void {
    if (this.state.isTransitioning) {
      this.state.isTransitioning = false;
      this.notify();
    }
  }

  /**
   * Genera la URL canónica según el estado actual
   */
  public generateCanonicalUrl(): string {
    const { currentLevel, activeDiscipline, activeProject, smAncla } = this.state;
    switch (currentLevel) {
      case 'N0':
      case 'N1':
        return conBase('');
      case 'N2':
        return conBase(`#${activeDiscipline ?? 'web'}`);
      case 'N3':
        return conBase(`${activeDiscipline ?? 'web'}/`);
      case 'N4':
        return conBase(`${activeDiscipline ?? 'web'}/${activeProject ?? ''}/`);
      case 'SM':
        return conBase(`#${smAncla}`);
    }
  }

  /**
   * Sincroniza el URL con la History API del navegador
   */
  private syncBrowserUrl(action: 'replaceState' | 'pushState' | 'none'): void {
    if (typeof window === 'undefined' || action === 'none') return;
    const url = this.generateCanonicalUrl();
    const currentFull = window.location.pathname + window.location.hash;
    if (currentFull === url || currentFull.replace(/\/$/, '') === url.replace(/\/$/, '')) return;

    if (action === 'pushState') window.history.pushState(this.getState(), '', url);
    else window.history.replaceState(this.getState(), '', url);
  }

  /**
   * Hidrata el estado a partir de la URL completa (pathname + hash)
   * Restaura con precisión el nivel y la disciplina activa sin perder el hash en N2.
   */
  public hydrateFromUrl(fullUrl: string): void {
    const [pathPart, hashPart] = fullUrl.split('#');
    const pathOnly = (pathPart ?? '').split('?')[0];
    const base = import.meta.env.BASE_URL.replace(/\/+$/, '');
    let relativePath = pathOnly;
    if (base && relativePath.startsWith(base)) {
      relativePath = relativePath.slice(base.length);
    }
    const segments = relativePath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

    if (segments.length === 0 || segments[0] === '') {
      // Sin la sección (GitHub Pages, lib/sobre-mi/visible.ts), /#sobre-mi y /#contacto abren el home.
      if (SOBRE_MI_VISIBLE && (hashPart === 'sobre-mi' || hashPart === 'contacto')) {
        this.state.currentLevel = 'SM';
        this.state.smAncla = hashPart;
        this.state.activeDiscipline = this.state.activeDiscipline ?? 'web';
      } else if (hashPart === 'disciplinas' || isValidDisciplineSlug(hashPart)) {
        this.state.currentLevel = 'N2';
        this.state.activeDiscipline = isValidDisciplineSlug(hashPart) ? hashPart : (this.state.activeDiscipline ?? 'web');
      } else {
        this.state.currentLevel = 'N1';
        this.state.activeDiscipline = 'web';
      }
      this.state.activeProject = null;
    } else if (segments.length === 1 && isValidDisciplineSlug(segments[0])) {
      this.state.currentLevel = 'N3';
      this.state.activeDiscipline = segments[0];
      this.state.activeProject = null;
    } else if (segments.length >= 2 && isValidDisciplineSlug(segments[0])) {
      this.state.currentLevel = 'N4';
      this.state.activeDiscipline = segments[0];
      this.state.activeProject = segments[1] || null;
    }

    this.state.isTransitioning = false;
    this.updateCanGoBack();
    this.notify();
  }
}
