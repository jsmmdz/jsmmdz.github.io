import type { DisciplineSlug } from '@/lib/navigation/types';
import { conMedia } from '@/lib/rutas';

export const ORDERED_SLUGS: readonly DisciplineSlug[] = [
  'web',
  'motion',
  '3d',
  'videojuegos',
  'editorial'
] as const;

/**
 * Retorna el clip y posición correspondiente al estado de reposo de cada área.
 * - web: t1-adelante en su primer cuadro (0.0s).
 * - motion a editorial: el clip que entra en su último cuadro (al final).
 */
export function obtenerClipReposo(slug: DisciplineSlug): { src: string; seekEnd: boolean } {
  switch (slug) {
    case 'web':
      return { src: conMedia('transiciones/t1-azul-ambar-adelante.mp4'), seekEnd: false };
    case 'motion':
      return { src: conMedia('transiciones/t1-azul-ambar-adelante.mp4'), seekEnd: true };
    case '3d':
      return { src: conMedia('transiciones/t2-ambar-verde-adelante.mp4'), seekEnd: true };
    case 'videojuegos':
      return { src: conMedia('transiciones/t3-verde-rojo-adelante.mp4'), seekEnd: true };
    case 'editorial':
      return { src: conMedia('transiciones/t4-rojo-editorial-adelante.mp4'), seekEnd: true };
    default:
      return { src: conMedia('transiciones/t1-azul-ambar-adelante.mp4'), seekEnd: false };
  }
}
