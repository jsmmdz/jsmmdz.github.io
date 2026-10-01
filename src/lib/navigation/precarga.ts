/**
 * Precarga de la página de un caso desde el mundo: el vuelo dura 1,0 s y la página del caso tiene que
 * estar montada a los ≈ 0,44 s, así que su HTML ya debe estar en la caché del navegador al hacer clic.
 * Un `<link rel="prefetch">` por dirección, una sola vez.
 */
const pedidas = new Set<string>();

export function precargar(href: string): void {
  if (pedidas.has(href) || typeof document === 'undefined') return;
  pedidas.add(href);
  const enlace = document.createElement('link');
  enlace.rel = 'prefetch';
  enlace.as = 'document';
  enlace.href = href;
  document.head.appendChild(enlace);
}
