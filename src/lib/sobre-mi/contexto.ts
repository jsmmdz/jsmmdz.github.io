/**
 * Lo que los módulos de «Sobre mí y contacto» comparten en cada cuadro del reloj único (`gsap.ticker`): dónde está
 * el scroll, cuánto mide una pantalla del escenario, el tema y la escena invertida. Lo arma `motor.ts`.
 */
import type { ConfigSobreMi } from './config';
import type { Tema } from './tema';

export interface Contexto {
  seccion: HTMLElement;
  config: ConfigSobreMi;
  /** Con movimiento reducido no hay coreografías ni Lenis suave (K30). */
  reducido: boolean;
  /** Con ratón (`any-hover: hover`): hay estela y chispas (K10). */
  ratonFino: boolean;
  /** ¿La composición de celular de Tonami (K29)? Cambia con el ancho y la orientación. */
  angosta: () => boolean;
  /** Lo que mide una pantalla del escenario fijo (px): el alto de la ventana en la unidad de la sección. */
  alto: number;
  ancho: number;
  /** `window.scrollY` de este cuadro. */
  y: number;
  /** El tiempo del reloj (s) y lo que pasó desde el cuadro anterior (s). */
  t: number;
  dt: number;
  nivel: () => string;
  tema: () => Tema;
  /** ¿Se vuelve a la página (recargar, atrás del navegador o regreso por el router)? Entonces se recupera el borrador. */
  vuelve: boolean;
  /** Cuánto de la escena invertida (0 clara, 1 oscura). La escribe la historia; la leen los orbes y el cursor. */
  oscuro: number;
}

export interface Modulo {
  /** Mide lo que depende del diseño (cuando la sección ya ocupa lugar, al cambiar de tamaño y al llegar las fuentes). */
  medir?: () => void;
  /** Un cuadro. Solo se llama con la sección en el documento. */
  actualizar?: (c: Contexto) => void;
  destruir: () => void;
}
