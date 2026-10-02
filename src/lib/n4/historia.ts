/**
 * Los pasos de la historia de un caso (T32): los comparten el marcado de la página (el `h2` de cada
 * paso) y el controlador. Los tipos y las reglas del contrato viven en `contrato.ts`.
 */

/** Los tipos de paso, en el orden en que suelen contarse. */
export const TIPOS_PASO = ['idea', 'problema', 'rol', 'decision', 'proceso', 'hallazgo', 'resultado'] as const;
export type TipoPaso = (typeof TIPOS_PASO)[number];

/** El nombre que lleva el `h2` de cada tipo de paso. */
export const NOMBRE_TIPO: Record<TipoPaso, string> = {
  idea: 'Idea',
  problema: 'Problema',
  rol: 'Rol y aporte',
  decision: 'Decisión',
  proceso: 'Proceso',
  hallazgo: 'Hallazgo',
  resultado: 'Resultado',
};

/** Un paso como lo necesita la escena: solo lo que se imprime en el cristal. */
export interface PasoVista {
  tipo: TipoPaso;
  destacado?: string;
  texto: string;
}

/** Una imagen del caso: la portada (medio −1) y la foto de cada paso (medio k). */
export interface MedioCaso {
  src: string;
  ancho: number;
  alto: number;
  alt: string;
}
