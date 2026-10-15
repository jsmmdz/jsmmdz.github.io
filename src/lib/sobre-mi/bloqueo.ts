/**
 * La sección bloqueada (autor, 2026-10-15; `visible.ts`): cada letra y cada número de los datos pasa a «X» y se
 * conservan los espacios y la puntuación, para que la composición no cambie. Se hace en los datos, al construir:
 * el texto real no llega al HTML ni a la configuración que lee el navegador (la historia y el formulario cambian
 * sus textos con ella). Las rutas, los enlaces, los identificadores y la clave de Web3Forms no se tocan.
 */
const INTACTAS = new Set(['src', 'href', 'id', 'endpoint', 'claveAcceso']);

export const aX = (texto: string): string => texto.replace(/[\p{L}\p{N}]/gu, 'X');

export function bloquear<T>(valor: T, clave = ''): T {
  if (typeof valor === 'string') return (INTACTAS.has(clave) ? valor : aX(valor)) as T;
  if (Array.isArray(valor)) return valor.map((v) => bloquear(v, clave)) as T;
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, bloquear(v, k)])) as T;
  }
  return valor;
}
