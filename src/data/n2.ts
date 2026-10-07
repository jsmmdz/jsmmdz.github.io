// Textos de N2 (menú de disciplinas). Los escribe el orquestador; el constructor los lee y no
// los edita. Todo es provisional: el autor pidió texto genérico «para ver la interfaz montada»
// (2026-09-26). Los nombres de las áreas viven en content/disciplina/*.json.
export interface DatosN2 {
  /** El titular gigante detrás del anillo (Aikawa: «PORTFOLIO»). */
  titular: string;
  /** Esquina superior izquierda. */
  marca: string;
  /** Esquina inferior izquierda: cómo se navega. */
  instruccion: string;
  /** El único CTA (D5 C, R6). Abajo a la derecha: desde T35 lleva a «Sobre mí» (/#sobre-mi). */
  cta: { texto: string; href: string };
  /** Botón redondo de la pastilla y rótulo sobre el segmento enfocado (Aikawa: «VIEW»). */
  textoEntrar: string;
}

import { conBase } from '@/lib/rutas';

export const n2: DatosN2 = {
  titular: 'PORTAFOLIO',
  marca: 'JSMMDZ',
  instruccion: '[TEXTO DEL AUTOR] ← → para cambiar',
  cta: { texto: 'Sobre mí', href: conBase('#sobre-mi') }, // T35: lleva a la sección «Sobre mí y contacto»
  textoEntrar: 'Ver',
};
