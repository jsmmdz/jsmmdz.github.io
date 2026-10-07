/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** «1» en el build de GitHub Pages (tools/publicar.mjs): «Sobre mí y contacto» no se publica (`lib/sobre-mi/visible.ts`). */
  readonly PUBLIC_OCULTAR_SOBRE_MI?: string;
}
