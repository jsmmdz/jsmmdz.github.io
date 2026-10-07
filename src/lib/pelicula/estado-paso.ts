/**
 * Estado compartido del paso entre el menú (N2) y la sección «Sobre mí» (T35).
 *
 * Vive aparte de `paso-sm.ts` para que `lenis.ts` pueda consultarlo sin un ciclo de módulos: `paso-sm.ts`
 * necesita a Lenis para mover la página, y Lenis necesita saber, antes de procesar cada gesto de la rueda,
 * si ese gesto le toca a él o a la película.
 */

let enCurso = false;

/** ¿Hay un paso suave N2 ↔ sección corriendo? Mientras dure, ningún gesto mueve la página. */
export function pasoEnCurso(): boolean {
  return enCurso;
}

export function fijarPasoEnCurso(valor: boolean): void {
  enCurso = valor;
}

let ultimoGesto: Event | null = null;

/**
 * Marca un gesto de la rueda como atendido por la sección: el N2 también escucha la rueda, y si la sección
 * acaba de devolverlo al N2 con este mismo gesto, el N2 no lo debe contar otra vez (subiría hasta el home).
 */
export function atenderGesto(e: Event): void {
  ultimoGesto = e;
}

export function gestoAtendido(e: Event): boolean {
  return ultimoGesto === e;
}

/**
 * Los gestos de la rueda (auditoría final de T35, E1 y E2): una ráfaga o la inercia de un trackpad llegan
 * como muchas ruedas seguidas. Una rueda empieza un gesto nuevo cuando la anterior llegó hace
 * `REPOSO_GESTO_MS` o más; la cola de un gesto que ya hizo cruzar un nivel (la caída del home al N2, la vuelta
 * de la sección al N2) no puede hacer cruzar otro. Un escucha en captura (`paso-sm.ts`) registra cada rueda
 * antes que todos los demás.
 */
export const REPOSO_GESTO_MS = 350;
let ruedaAnterior = Number.NEGATIVE_INFINITY;
let ruedaActual = Number.NEGATIVE_INFINITY;
let eventoRegistrado: Event | null = null;

export function registrarRueda(e: Event, ahora: number): void {
  if (eventoRegistrado === e) return;
  eventoRegistrado = e;
  ruedaAnterior = ruedaActual;
  ruedaActual = ahora;
}

/** ¿La rueda que se está atendiendo empieza un gesto nuevo? */
export function empiezaGesto(): boolean {
  return ruedaActual - ruedaAnterior >= REPOSO_GESTO_MS;
}

/** Margen, en px, con el que se considera que la sección está «arriba» (en el borde). */
export const BORDE_SECCION_PX = 2;

export type ClaseRueda =
  /** Lenis (o el navegador) la procesa como siempre. */
  | 'libre'
  /** Nadie mueve la página con ella: el N2 la atiende por su cuenta o hay un paso en curso. */
  | 'bloquear'
  /** Desde el borde de la sección, hacia arriba: devuelve al N2. */
  | 'volver'
  /** Hacia arriba pero cruzaría el borde de la sección: se detiene en el borde. */
  | 'ajustar';

function nivelActual(): string {
  return document.body?.dataset.currentLevel ?? '';
}

/**
 * Decide qué hace un gesto de la rueda según dónde está la película (T35, decisión 2).
 * Solo lee el DOM: se llama dos veces por gesto (el filtro de Lenis y el escucha de la película) y los
 * dos tienen que coincidir.
 */
export function clasificarRueda(deltaY: number): ClaseRueda {
  if (pasoEnCurso()) return 'bloquear';
  const nivel = nivelActual();
  // En el N2 la rueda nunca recorre la página: baja a la sección o sube al home, y eso lo decide el N2.
  if (nivel === 'N2') return 'bloquear';
  if (nivel === 'SM' && deltaY < 0) {
    const seccion = document.getElementById('act-sm');
    if (!seccion) return 'libre';
    const tope = seccion.getBoundingClientRect().top;
    if (tope >= -BORDE_SECCION_PX) return 'volver';
    if (-tope < Math.abs(deltaY)) return 'ajustar';
  }
  return 'libre';
}

/**
 * Filtro `virtualScroll` de Lenis: devuelve `false` cuando el gesto no debe mover la página con Lenis.
 * Solo atiende la rueda: el dedo (táctil) sigue siendo nativo y lo ordena el escucha de scroll.
 */
export function filtrarRueda(datos: { deltaY: number; event: Event }): boolean {
  if (!(datos.event instanceof WheelEvent)) return true;
  if (clasificarRueda(datos.deltaY) === 'libre') return true;
  if (datos.event.cancelable) datos.event.preventDefault();
  return false;
}
