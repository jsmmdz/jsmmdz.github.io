import type { DisciplineSlug } from '@/lib/navigation/types';
import type { PasoTransicion } from './types';
import { conMedia } from '@/lib/rutas';

export const ORDERED_SLUGS: readonly DisciplineSlug[] = [
  'web',
  'motion',
  '3d',
  'videojuegos',
  'editorial'
] as const;

interface ClipPar {
  adelante: string;
  atras: string;
  duracionS: number;
}

const CLIPS_TRANSICION: Record<number, ClipPar> = {
  0: {
    adelante: conMedia('transiciones/t1-azul-ambar-adelante.mp4'),
    atras: conMedia('transiciones/t1-azul-ambar-atras.mp4'),
    duracionS: 1.42,
  },
  1: {
    adelante: conMedia('transiciones/t2-ambar-verde-adelante.mp4'),
    atras: conMedia('transiciones/t2-ambar-verde-atras.mp4'),
    duracionS: 2.02,
  },
  2: {
    adelante: conMedia('transiciones/t3-verde-rojo-adelante.mp4'),
    atras: conMedia('transiciones/t3-verde-rojo-atras.mp4'),
    duracionS: 1.62,
  },
  3: {
    adelante: conMedia('transiciones/t4-rojo-editorial-adelante.mp4'),
    atras: conMedia('transiciones/t4-rojo-editorial-atras.mp4'),
    duracionS: 1.82,
  },
};

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

/**
 * Genera la secuencia ordenada de videos necesarios para transicionar entre dos disciplinas.
 * Encadena pasos adelante o atrás según la dirección en el orden lineal cerrado.
 */
export function planearSecuencia(desdeSlug: DisciplineSlug, hastaSlug: DisciplineSlug): PasoTransicion[] {
  const desdeIdx = ORDERED_SLUGS.indexOf(desdeSlug);
  const hastaIdx = ORDERED_SLUGS.indexOf(hastaSlug);
  if (desdeIdx === -1 || hastaIdx === -1 || desdeIdx === hastaIdx) return [];

  const pasos: PasoTransicion[] = [];
  if (desdeIdx < hastaIdx) {
    for (let i = desdeIdx; i < hastaIdx; i++) {
      const clip = CLIPS_TRANSICION[i];
      if (clip) {
        pasos.push({
          clip: clip.adelante,
          duracionS: clip.duracionS,
          destinoSlug: ORDERED_SLUGS[i + 1]
        });
      }
    }
  } else {
    for (let i = desdeIdx; i > hastaIdx; i--) {
      const clip = CLIPS_TRANSICION[i - 1];
      if (clip) {
        pasos.push({
          clip: clip.atras,
          duracionS: clip.duracionS,
          destinoSlug: ORDERED_SLUGS[i - 1]
        });
      }
    }
  }
  return pasos;
}
