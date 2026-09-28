/**
 * Helper central para resolver rutas relativas a la base del sitio.
 * Garantiza compatibilidad tanto en raíz (/) como bajo subcarpetas (/repo/) en GitHub Pages.
 */

export function conBase(ruta: string = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  if (!ruta || ruta === '/') {
    return base;
  }

  if (ruta.startsWith('#')) {
    return `${base}${ruta}`;
  }

  const limpia = ruta.replace(/^\/+/, '');
  return `${base}${limpia}`;
}

export function conMedia(ruta: string = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/')
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;

  const limpia = ruta.replace(/^\/+/, '');
  return `${base}media/${limpia}`;
}
