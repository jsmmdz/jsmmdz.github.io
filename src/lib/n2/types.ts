import type { DisciplineSlug } from '@/lib/navigation/types';

/**
 * Contratos de tipos para el menú cinematográfico de disciplinas (N2).
 */
export interface DisciplinaN2 {
  slug: DisciplineSlug;
  orden: number;
  nombre: string;
  colorHex: string;
  colorNombre: string;
  outfitImage: string;
  videoAdelante?: string;
  videoAtras?: string;
}

export interface PasoTransicion {
  clip: string;
  duracionS: number;
  destinoSlug: DisciplineSlug;
}
