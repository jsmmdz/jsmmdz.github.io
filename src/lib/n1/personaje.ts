/**
 * El personaje del home (T36): el punto de entrada para cambiarlo.
 *
 * Hoy es una imagen recortada (`img[data-n1-personaje]`, el outfit verde de 3D). Cuando el autor entregue el
 * modelo 3D con esqueleto (la pose ligada a la caída y la luz de contorno de Digitalists, ficha T36, K1–K3 y
 * K5), `montarPersonaje()` es lo único que cambia: devuelve el elemento que el paralaje mueve y una función
 * que libera lo que haya creado. El resto del home (paralaje, capas, columnas) no se entera.
 */

export interface PersonajeMontado {
  /** Lo que el paralaje traslada: la imagen hoy; el lienzo del modelo mañana. */
  elemento: HTMLElement;
  /** Libera lo que `montarPersonaje` haya creado (con la imagen no hay nada que liberar). */
  destruir: () => void;
}

export function montarPersonaje(seccion: HTMLElement): PersonajeMontado | null {
  const imagen = seccion.querySelector<HTMLImageElement>('img[data-n1-personaje]');
  if (!imagen) return null;
  return { elemento: imagen, destruir: () => undefined };
}
