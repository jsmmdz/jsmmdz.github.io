/**
 * La exposición del design system (autor, 2026-10-02). Si el caso trae `designSystem`, la historia gana un
 * tramo más, justo antes de los resultados finales (T38: la serie de pasos `resultado` con que termina): una sección a pantalla completa, con la paleta a
 * la izquierda (cinco cristales teñidos de cada color con su hexadecimal) y las tipografías a la derecha,
 * en un cristal del tamaño de los de la historia, escritas en su fuente real. Mientras dura, la foto de la
 * derecha y los cristales de la historia se desvanecen; al salir vuelve la foto con el resultado.
 *
 * Es matemática pura (no toca el DOM ni WebGL): la usan el mundo WebGL, el controlador y las pruebas.
 */
import { avanceConMeseta, RECORRIDO } from './cristales';
import { mezclaDelLimite, MEDIA_VENTANA_FUNDIDO } from './medios';

// ---------- El tramo del design system dentro de la historia ----------

/**
 * Dónde va el design system: el índice del primer paso de la serie de resultados finales (los pasos
 * `resultado` con que termina el caso), que con la sección se corre. Es el `ds` de todas las funciones de
 * abajo (`null`: el caso no trae design system). Un caso con un solo resultado final lo pone antes de él.
 */
export function primerResultadoFinal(tipos: readonly string[]): number {
  let k = tipos.length;
  while (k > 1 && tipos[k - 1] === 'resultado') k--;
  return Math.min(k, Math.max(0, tipos.length - 1));
}

/**
 * Tramos de más a cada lado de la sección (T37, autor 2026-10-04: en el tramo nada se cruza). La historia y la
 * foto se desvanecen en el límite de entrada, como antes; los cristales de la sección suben igual que los de
 * la historia, pero desde el centro de un tramo más largo, así que entran cuando la historia y la foto ya se
 * fueron y salen por arriba antes de que vuelvan el resultado y su foto.
 */
export const HUECO_DS = 1.25;

/** Cuántos tramos ocupa la sección. */
export const LARGO_DS = 1 + 2 * HUECO_DS;

/**
 * Cuántos tramos ocupa la sección de resultados (autor, 2026-10-06: «reduce un poco el espaciado entre
 * secciones»): menos que la del design system. Sus marcos suben más rápido en la misma proporción, así que entran
 * cuando la historia y la foto ya se fueron, igual que la paleta.
 */
export const LARGO_GALERIA = 2.5;

// Todas las funciones de la sección reciben su largo (`largo`); por omisión, el del design system

/** Tramo en que cruza el centro el cristal del paso k (`ds`: índice donde va la sección, o null). */
export const tramoDelPaso = (k: number, ds: number | null, largo = LARGO_DS) => (ds !== null && k >= ds ? k + largo : k);

/** Cuántos tramos tiene la historia: los pasos y, si hay, los de la sección. */
export const totalTramos = (n: number, ds: number | null, largo = LARGO_DS) => n + (ds !== null ? largo : 0);

/** Posición (px virtuales) en que la sección está al centro: la mitad de su tramo. */
export const centroDS = (ds: number, tramo: number, largo = LARGO_DS) => (ds + 1 + largo / 2) * tramo;

/**
 * Los tramos en que se detienen AvPág y RePág (su centro es `centroDelPaso`): el de cada cristal y, si hay
 * design system, el del centro de la sección. El último es el final del caso.
 */
export function tramosDeAnclas(n: number, ds: number | null, largo = LARGO_DS): number[] {
  const ts = Array.from({ length: Math.max(1, n) }, (_, k) => tramoDelPaso(k, ds, largo));
  if (ds !== null) ts.splice(ds, 0, ds + (largo - 1) / 2);
  return ts;
}

/**
 * La posición de la historia sin el tramo del design system: con ella se calculan la foto y el paso activo.
 * Mientras dura la sección se queda justo antes del fundido del resultado (que no empieza) y, al salir,
 * sigue `LARGO_DS` tramos atrás: el fundido del resultado cae en el límite de salida de la sección.
 */
export function posHistoria(pos: number, tramo: number, ds: number | null, largo = LARGO_DS): number {
  if (ds === null || tramo <= 0) return pos;
  const espera = (ds + 1 - MEDIA_VENTANA_FUNDIDO) * tramo;
  if (pos <= espera) return pos;
  if (pos <= espera + largo * tramo) return espera;
  return pos - largo * tramo;
}

/** Cuánto se ve la sección (0 a 1): entra y sale con los fundidos de los límites de su tramo. */
export function presenciaDS(pos: number, tramo: number, ds: number | null, largo = LARGO_DS): number {
  if (ds === null) return 0;
  return mezclaDelLimite(ds, pos, tramo) * (1 - mezclaDelLimite(ds + largo, pos, tramo));
}

// ---------- La pose de la paleta y del cristal de las tipografías ----------

/** Ancho de cada cristal de la paleta, en anchos del cristal de la historia. */
export const ANCHO_COLOR = 0.5;
/** Ancho del cristal de las tipografías, en anchos del cristal de la historia. */
export const ANCHO_FUENTES = 1.25;
/** Dónde queda cada color en reposo, en anchos del cristal de la historia desde el centro del grupo. */
export const LUGAR_COLOR: ReadonlyArray<readonly [number, number]> = [
  [-0.58, -0.21],
  [0, -0.25],
  [0.58, -0.19],
  [-0.3, 0.22],
  [0.31, 0.25],
];
/** Giro de reposo de cada color (rad): casi de frente, para que el color y el hexadecimal se lean. */
export const GIRO_COLOR: ReadonlyArray<readonly [number, number, number]> = [
  [0.12, -0.18, 0.1],
  [-0.08, 0.1, -0.06],
  [0.1, 0.16, 0.14],
  [-0.12, -0.12, -0.1],
  [0.08, 0.14, 0.08],
];
/** Giro de reposo del cristal de las tipografías. */
export const GIRO_FUENTES: readonly [number, number, number] = [0.06, -0.12, -0.04];
/** Centro del grupo de colores y del cristal de las tipografías, en fracciones del ancho (escritorio). */
const X_PALETA = 0.27;
const X_FUENTES = 0.73;
/** En angosto: el grupo arriba y las tipografías abajo, en fracciones del alto. */
const Y_PALETA_ANGOSTO = 0.3;
const Y_FUENTES_ANGOSTO = 0.7;
/** Cascada: cada cristal llega un poco después que el anterior, en fracciones del tramo. */
const CASCADA = 0.06;
/** Margen a los bordes de la ventana (px). */
const MARGEN_PX = 16;
/** Cuánto más ancha que el cristal puede ser su caja proyectada al girar. */
const CRECE_AL_GIRAR = 1.16;

export interface PoseDS {
  /** Centro del cristal (px de la ventana). */
  cx: number;
  cy: number;
  /** Ancho del cristal (px). */
  ancho: number;
  giro: [number, number, number];
}

interface DisposicionDS {
  angosto: boolean;
  ancho: number;
  alto: number;
  anchoCristal: number;
}

/**
 * Cuánto ha subido un cristal del tramo de la sección (px), con un retraso de `retraso` tramos. Una sección más
 * corta que la del design system sube más rápido, en la misma proporción.
 */
export function subida(ds: number, pos: number, tramo: number, alto: number, retraso: number, reducido: boolean, largo = LARGO_DS): number {
  if (reducido) return 0;
  const s = ((pos - centroDS(ds, tramo, largo)) / tramo) * (LARGO_DS / largo) - retraso;
  return RECORRIDO * alto * avanceConMeseta(s);
}

/** La pose del color i: sube en cascada con la sección, como un cristal de la historia, y sigue de largo. */
export function poseColor(i: number, ds: number, pos: number, tramo: number, d: DisposicionDS, reducido: boolean): PoseDS {
  const [lx, ly] = LUGAR_COLOR[i % LUGAR_COLOR.length];
  const giro = [...GIRO_COLOR[i % GIRO_COLOR.length]] as [number, number, number];
  // El primero se adelanta y el último va un poco detrás
  const retraso = (i - (LUGAR_COLOR.length - 1) / 2) * CASCADA;
  if (!d.angosto) {
    const ancho = ANCHO_COLOR * d.anchoCristal;
    const cx0 = X_PALETA * d.ancho;
    // El grupo cabe en la mitad izquierda
    const libre = Math.min(cx0, d.ancho / 2 - cx0 + d.ancho * 0.03) - MARGEN_PX - (ancho * CRECE_AL_GIRAR) / 2;
    const abre = Math.max(0, Math.min(d.anchoCristal, libre / 0.58));
    return { cx: cx0 + lx * abre, cy: d.alto / 2 + ly * d.anchoCristal - subida(ds, pos, tramo, d.alto, retraso, reducido), ancho, giro };
  }
  const ancho = Math.min(ANCHO_COLOR * d.anchoCristal, (d.ancho - 2 * MARGEN_PX) / 3.4);
  const abre = (d.ancho / 2 - MARGEN_PX - (ancho * CRECE_AL_GIRAR) / 2) / 0.58;
  return { cx: d.ancho / 2 + lx * abre, cy: Y_PALETA_ANGOSTO * d.alto + ly * ancho * 2 - subida(ds, pos, tramo, d.alto, retraso, reducido), ancho, giro };
}

/** La pose del cristal de las tipografías: a la derecha (abajo en angosto), sube con la sección. */
export function poseFuentes(ds: number, pos: number, tramo: number, d: DisposicionDS, reducido: boolean): PoseDS {
  const giro = [...GIRO_FUENTES] as [number, number, number];
  if (!d.angosto) {
    const ancho = Math.min(ANCHO_FUENTES * d.anchoCristal, (d.ancho / 2 - 2 * MARGEN_PX) / CRECE_AL_GIRAR);
    return { cx: X_FUENTES * d.ancho, cy: d.alto / 2 - subida(ds, pos, tramo, d.alto, 0.05, reducido), ancho, giro };
  }
  const ancho = Math.min(d.anchoCristal, (d.ancho - 2 * MARGEN_PX) / CRECE_AL_GIRAR);
  return { cx: d.ancho / 2, cy: Y_FUENTES_ANGOSTO * d.alto - subida(ds, pos, tramo, d.alto, 0.05, reducido), ancho, giro };
}

/** Cuánto se ve un cristal de la sección: con movimiento reducido, la presencia; si no, siempre (entra y sale subiendo). */
export function opacidadDS(ds: number, pos: number, tramo: number, reducido: boolean, largo = LARGO_DS): number {
  return reducido ? presenciaDS(pos, tramo, ds, largo) : 1;
}

// ---------- El texto ----------

/** Luminancia relativa de WCAG de un color `#RRGGBB`. */
function luminancia(hex: string): number {
  const canal = (k: number) => {
    const v = parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** El color del hexadecimal impreso: el que más contraste dé sobre el color del cristal (crema u oscuro). */
export function tintaSobre(hex: string, crema: string, oscuro: string): string {
  const l = luminancia(hex);
  const contra = (otro: string) => {
    const [a, b] = [l, luminancia(otro)].sort((x, y) => y - x);
    return (a + 0.05) / (b + 0.05);
  };
  return contra(crema) >= contra(oscuro) ? crema : oscuro;
}

/** La familia CSS con que se declara la fuente i del caso (la `@font-face` la pone la página). */
export const familiaFuente = (i: number) => `n4-fuente-${i}`;
