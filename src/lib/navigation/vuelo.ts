/**
 * Estado compartido del vuelo N3 → N4 entre páginas.
 *
 * El vuelo de la pieza dura 1,0 s y la página del caso se navega al clic (como Landberg), así que el
 * mundo N3 (que dibuja el vuelo) y la página N4 (que ya muestra su texto) coexisten un rato. Este
 * módulo es lo único que los une: el instante del clic, para que las entradas del N4 cuenten desde
 * ahí, y la textura de la pieza, que el N3 entrega al aterrizar para que el N4 la dibuje sin un
 * cuadro negro. No importa three: la textura viaja como un objeto opaco que solo el N4 abre.
 *
 * Es un módulo con estado: Astro mantiene el mismo módulo entre páginas del `ClientRouter`.
 */

/** Algo que se libera (la `THREE.Texture` cumple: este módulo no importa three). */
export interface Liberable {
  dispose(): void;
}

/** La textura de la pieza que aterrizó, con su proporción. */
export interface RelevoVuelo {
  /** `THREE.Texture` ya subida a la GPU; quien la recibe es su dueño y la libera. */
  textura: Liberable;
  /** Dirección absoluta de la imagen de la pieza, para comprobar que es la del medio 0. */
  fuente: string;
  /** ancho / alto de la imagen. */
  aspecto: number;
}

export interface VueloIda {
  slug: string;
  /** `performance.now()` en el clic. */
  tClic: number;
  /** El vuelo aterrizó y el N3 ya entregó su relevo. */
  entregado: boolean;
  /** El vuelo se canceló: el caso se abre sin relevo. */
  cancelado: boolean;
  relevo: RelevoVuelo | null;
}

let actual: VueloIda | null = null;
let oyentes: Array<(v: VueloIda) => void> = [];
/** El caso al que se llegó volando, para que su salida vuele de regreso. */
let llegadaVolando: string | null = null;
/** La pieza que acaba de volar de regreso: el N3 la deja quieta en su sitio al montar. */
let regresoDe: string | null = null;

/** El N3 empezó el vuelo de la pieza `slug`. */
export function iniciarVueloIda(slug: string): VueloIda {
  soltarRelevo();
  actual = { slug, tClic: performance.now(), entregado: false, cancelado: false, relevo: null };
  llegadaVolando = slug;
  return actual;
}

export function vueloIdaEnCurso(): VueloIda | null {
  return actual;
}

/** El vuelo se canceló (Esc o atrás en el mundo): el caso se abre sin relevo y deja de esperarlo. */
export function cancelarVueloIda(): void {
  soltarRelevo();
  llegadaVolando = null;
  const v = actual;
  actual = null;
  if (v) {
    v.cancelado = true;
    for (const cb of oyentes) cb(v);
  }
}

/** El N3 aterrizó la pieza: entrega la textura y avisa al N4 si ya está esperando. */
export function entregarVueloIda(relevo: RelevoVuelo | null): void {
  if (!actual) {
    liberar(relevo);
    return;
  }
  actual.entregado = true;
  actual.relevo = relevo;
  const v = actual;
  for (const cb of oyentes) cb(v);
}

/** El N4 espera el aterrizaje; devuelve cómo dejar de esperar. */
export function alEntregarVueloIda(cb: (v: VueloIda) => void): () => void {
  oyentes.push(cb);
  return () => {
    oyentes = oyentes.filter((o) => o !== cb);
  };
}

/** El N4 toma el relevo (una sola vez). */
export function tomarRelevo(): RelevoVuelo | null {
  const r = actual?.relevo ?? null;
  if (actual) actual.relevo = null;
  return r;
}

/** Fin del vuelo de ida para el N4 (ya recibió su relevo o no hace falta). */
export function terminarVueloIda(): void {
  soltarRelevo();
  actual = null;
}

/** ¿Se llegó a este caso desde el mundo con el vuelo? Entonces la salida vuela de regreso. */
export function llegueVolandoA(slug: string): boolean {
  return llegadaVolando === slug;
}

export function olvidarLlegada(): void {
  llegadaVolando = null;
}

export function marcarRegreso(slug: string): void {
  regresoDe = slug;
  llegadaVolando = null;
}

/** El N3 consulta (y consume) de qué pieza viene el regreso. */
export function tomarRegreso(): string | null {
  const s = regresoDe;
  regresoDe = null;
  return s;
}

function liberar(relevo: RelevoVuelo | null): void {
  relevo?.textura.dispose();
}

function soltarRelevo(): void {
  if (actual?.relevo) {
    liberar(actual.relevo);
    actual.relevo = null;
  }
}
