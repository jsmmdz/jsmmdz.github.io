/**
 * Contratos de Tipos para la Navegación Cinemática del Portafolio
 * Define los niveles cerrados de la película (N0–N4 y SM, «sobre mí», debajo del N2), el estado global y los eventos permitidos.
 */

export type Level = 'N0' | 'N1' | 'N2' | 'N3' | 'N4' | 'SM';

export type DisciplineSlug = 'web' | 'motion' | '3d' | 'videojuegos' | 'editorial';

export const VALID_LEVELS: readonly Level[] = ['N0', 'N1', 'N2', 'N3', 'N4', 'SM'] as const;

export function isValidLevel(value: unknown): value is Level {
  return typeof value === 'string' && (VALID_LEVELS as readonly string[]).includes(value);
}

/** Las dos direcciones de la sección «Sobre mí» (T35 y T36): arriba, o abierta en el bloque del formulario. */
export type SmAncla = 'sobre-mi' | 'contacto';

export interface NavigationState {
  currentLevel: Level;
  /** Con qué dirección se abrió el nivel SM (`/#sobre-mi` o `/#contacto`). Fuera de SM no se usa. */
  smAncla: SmAncla;
  activeDiscipline: DisciplineSlug | null;
  activeProject: string | null;
  isTransitioning: boolean;
  canGoBack: boolean;
  historyAction: 'replaceState' | 'pushState' | 'none';
}

export type TransitionTrigger =
  | { type: 'PRELOAD_COMPLETE' } // N0 -> N1
  | { type: 'SCROLL_DROP' } // N1 -> N2 ("La caída")
  | { type: 'SCROLL_UP' } // N2 -> N1 ("Subir al Home")
  | { type: 'ENTER_SM'; via: 'rueda' | 'enlace'; ancla?: SmAncla } // N2 -> SM (rueda: replaceState) ó N1/N2 -> SM (enlace: pushState); `ancla`: /#contacto (T36)
  | { type: 'EXIT_SM' } // SM -> N2 (la rueda hacia arriba desde el borde de la sección)
  | { type: 'CYCLE_DISCIPLINE'; direction: 'next' | 'prev'; targetDiscipline?: DisciplineSlug } // N2 -> N2
  | { type: 'ENTER_WORLD'; discipline: DisciplineSlug } // N2 -> N3 (Entrar al mundo 3D)
  | { type: 'SELECT_PROJECT'; projectSlug: string } // N3 -> N4 (Desplegar caso de estudio)
  | { type: 'BACK_BUTTON_CLICK' } // N4 -> N3 ó N3 -> N2
  | { type: 'POPSTATE'; urlPath: string } // Evento popstate del navegador (pathname + hash)
  | { type: 'DEEP_LINK_HYDRATE'; level: Level; discipline?: DisciplineSlug; projectSlug?: string }; // Carga directa de URL

export interface LegalTransitionRule {
  from: Level;
  to: Level;
  requiresBlackHinge: boolean;
  description: string;
}
