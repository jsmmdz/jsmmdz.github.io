/**
 * ¿Se publica la sección «Sobre mí y contacto» (T35)? Mientras el autor la termina, queda oculta al público
 * (autor, 2026-10-06; `docs/1-PRODUCTO.md` § 7). `tools/publicar.mjs` deja `PUBLIC_OCULTAR_SOBRE_MI=1` en el
 * repo de GitHub Pages (y no le copia la sección); en `npm run dev`, en el build local y en las pruebas se ve.
 *
 * Oculta, no se monta: sin la sección, sin «Sobre mí» ni «Contacto» en el home, sin el botón del menú; la
 * rueda no baja al final del menú y `/#sobre-mi` y `/#contacto` abren el home.
 */
export const SOBRE_MI_VISIBLE: boolean = import.meta.env.PUBLIC_OCULTAR_SOBRE_MI !== '1';
