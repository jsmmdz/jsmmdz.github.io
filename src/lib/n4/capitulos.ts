/**
 * Los capítulos del caso, en el orden del spec (docs/1-PRODUCTO.md § 3): lo comparten el marcado de la
 * página (el texto de cada bloque y el rótulo de la regla) y el controlador.
 */
export const CAPITULOS = ['Idea', 'Problema', 'Rol y aporte', 'Decisiones', 'Proceso', 'Hallazgos', 'Resultado'] as const;

// La regla de capítulos (ZK8): 10 marcas de 6 px por altura de ventana de scroll (una cada 0,1 alturas).
// Un capítulo mide 1,75 alturas de ventana de recorrido. El marcado de la página y `regla.ts` comparten estas cifras.
export const PX_POR_MARCA = 6;
export const PX_POR_ALTO = 10 * PX_POR_MARCA;
export const PX_POR_CAPITULO = 1.75 * PX_POR_ALTO;

/** Cuántos medios admite un caso: uno por capítulo. */
export const MAX_MEDIOS = CAPITULOS.length;

/** Medios del caso (como salen de la colección): el medio k es el del capítulo k; faltantes repiten el último. */
export interface MedioCaso {
  src: string;
  ancho: number;
  alto: number;
  alt: string;
  video?: string;
}

/** Repite el último medio hasta completar los capítulos; sin medios, todos son la portada. */
export function mediosPorCapitulo(medios: MedioCaso[] | undefined, portada: MedioCaso): MedioCaso[] {
  const base = medios && medios.length > 0 ? medios.slice(0, MAX_MEDIOS) : [portada];
  return CAPITULOS.map((_, k) => base[Math.min(k, base.length - 1)]);
}
