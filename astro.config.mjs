import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import { fileURLToPath } from 'node:url';

// https://astro.build/config
export default defineConfig({
  site: process.env.SITIO_URL ?? 'https://jsmmdz.github.io',
  base: process.env.SITIO_BASE ?? '/',
  output: 'static',
  integrations: [mdx()],
  vite: {
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url))
      }
    },
    ssr: {
      noExternal: ['three', 'gsap']
    }
  }
});
