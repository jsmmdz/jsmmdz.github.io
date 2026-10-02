/**
 * Dónde cae cada cosa del N4 en la ventana (T32): la foto, la columna de los cristales y el centro de
 * la meseta. Es matemática pura: el controlador la calcula con el tamaño de la ventana y el rectángulo
 * real de la foto (que maqueta el CSS) y se la pasa al mundo WebGL.
 *
 * Escritorio (desde 1024 px, rem de Landberg): la columna de los cristales va de 2 a 62 rem y el centro
 * de cada cristal en x `31,5 rem + 50·xₖ rem`; la meseta cae al centro de la ventana. Angosto: la misma
 * escena con la foto arriba y los cristales en el espacio de debajo; el centro de ese espacio es el
 * centro de la meseta y el ancho del cristal cabe en la pantalla.
 */
import { N4_MEDIO, remDeVentana, type RectPortada } from './portada';

/** Centro de la columna de los cristales, en rem (escritorio). */
export const COLUMNA_X_REM = 31.5;
/** Cuánto vale 1 en `X_CRISTAL`, en rem (escritorio). */
export const ESCALA_X_REM = 50;
/** Ancho base del cristal, en rem (escritorio). */
export const ANCHO_CRISTAL_REM = 44;
/** El título: ancho máximo y tamaño máximo de letra, en rem (escritorio). */
export const TITULO_ANCHO_REM = 44;
export const TITULO_TAMANO_REM = 4.5;
/** Cuánto más ancha que el cristal puede llegar a ser su caja proyectada al girar (medido sobre las formas). */
const CRECE_AL_GIRAR = 1.16;
/** En angosto: margen a los lados y separación entre la foto y los cristales, en px. */
const MARGEN_ANGOSTO = 16;
/** 1 rem del N4 en angosto, en px. */
const REM_ANGOSTO = 16;

export interface Disposicion {
  angosto: boolean;
  ancho: number;
  alto: number;
  /** 1 rem del N4, en px. */
  remPx: number;
  /** La foto (el rectángulo del DOM). */
  foto: RectPortada;
  /** Centro de la columna de los cristales (px). */
  columnaX: number;
  /** Altura del centro de la meseta (px desde arriba). */
  mesetaY: number;
  /** Ancho base del cristal (px). */
  anchoCristal: number;
  /** Cuántos px vale 1 en `X_CRISTAL`. */
  escalaX: number;
}

/** `foto` es el rectángulo real de la foto en la ventana (px CSS). */
export function disposicion(ancho: number, alto: number, foto: RectPortada): Disposicion {
  const angosto = ancho < N4_MEDIO.anchoMinEscritorioPx;
  if (!angosto) {
    const rem = remDeVentana(ancho);
    return {
      angosto,
      ancho,
      alto,
      remPx: rem,
      foto,
      columnaX: COLUMNA_X_REM * rem,
      mesetaY: alto / 2,
      anchoCristal: ANCHO_CRISTAL_REM * rem,
      escalaX: ESCALA_X_REM * rem,
    };
  }
  const espacioArriba = foto.y + foto.height + MARGEN_ANGOSTO;
  const espacio = Math.max(1, alto - espacioArriba);
  // El cristal más ancho cabe en la pantalla (con su descentrado) y no es más alto que el espacio libre
  const cabe = (ancho - 2 * MARGEN_ANGOSTO) / (CRECE_AL_GIRAR + (0.08 * ESCALA_X_REM) / ANCHO_CRISTAL_REM);
  const anchoCristal = Math.max(120, Math.min(cabe, 1.1 * espacio));
  return {
    angosto,
    ancho,
    alto,
    remPx: REM_ANGOSTO,
    foto,
    columnaX: ancho / 2,
    mesetaY: espacioArriba + espacio / 2,
    anchoCristal,
    escalaX: (anchoCristal * ESCALA_X_REM) / ANCHO_CRISTAL_REM,
  };
}
