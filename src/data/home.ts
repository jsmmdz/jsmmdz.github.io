// Textos y datos del home (N1), calcado de noth.in (docs/1-PRODUCTO.md § 7, decisiones del autor del
// 2026-10-03). Los inventados llevan [EJEMPLO] aquí, en el código, no en pantalla, hasta que el autor
// los reemplace. La posición de cada texto sale de fabrica/buzon/T33/referente/noth-1440-tinta.jpg.

export interface Enlace {
  texto: string;
  href: string;
}

export interface DatosHome {
  /** El titular: «JSMMDZ», su usuario de Instagram, sin arroba. Es el único h1 del home. */
  nombre: string;
  /** Arriba a la izquierda, en dos líneas. [EJEMPLO]: texto provisional. */
  frase: readonly [string, string];
  /** Botón de debajo de la frase: baja al menú (lo intercepta lib/pelicula/scroll.ts). */
  cta: Enlace;
  /** Abajo a la izquierda. [EJEMPLO]: texto provisional. */
  rotulo: string;
  /** Abajo a la derecha: «LinkedIn / Instagram». Abren en otra pestaña. */
  linkedin: Enlace;
  instagram: Enlace;
  /** Arriba a la derecha: «Disciplinas ::», baja al menú (no hay menú desplegable). */
  disciplinas: Enlace;
  /** El video que se ve dentro de la tinta: «JSMMDZ» en materiales sobre negro (clip provisional). */
  materiales: { src: string };
}

// @deprecated: `home.personaje` y `home.tarjeta` ya no se dibujan en el home. Siguen aquí solo porque
// `N0Preloader.astro` los precarga (líneas 36-37) y N0 es de T34, que los quita junto con ellos. Se marcan
// con un comentario y no con la etiqueta JSDoc: la etiqueta hace que `astro check` avise (hint) en N0, que
// no es de esta tarea, y la compuerta `check` exige 0 hints.
export interface DatosHomeHeredados {
  // @deprecated: el personaje salió del home (§ 7, 2026-10-03). Lo quita T34.
  personaje: {
    src: string;
    alt: string;
    ancho: number;
    alto: number;
    lado: 'izquierda' | 'derecha' | 'centro';
  };
  // @deprecated: la tarjeta «Trabajemos juntos» salió con Mr. BLACK. Lo quita T34.
  tarjeta: Enlace & { miniatura: string; alt: string };
}

import { conBase, conMedia } from '@/lib/rutas';

export const home: DatosHome & DatosHomeHeredados = {
  nombre: 'JSMMDZ',
  frase: [
    'No es un estilo, es una mirada.', // [EJEMPLO]
    'Cinco disciplinas, un mismo autor.', // [EJEMPLO]
  ],
  cta: { texto: 'Ver mi trabajo', href: '#disciplinas' },
  rotulo: 'Junior Mejía · Creación digital · Bogotá', // [EJEMPLO]
  linkedin: {
    texto: 'LinkedIn',
    href: 'https://www.linkedin.com/in/junior-smith-mejia-mendez-003a81362/',
  },
  instagram: { texto: 'Instagram', href: 'https://www.instagram.com/jsmmdz/' },
  disciplinas: { texto: 'Disciplinas', href: '#disciplinas' },
  materiales: { src: conMedia('home/jsmmdz-materiales.mp4') },

  // Heredados (@deprecated): los precarga N0Preloader.astro hasta que T34 lo reemplace.
  personaje: {
    src: conMedia('personaje/laterales/01-azul-web.png'),
    alt: '',
    ancho: 1248,
    alto: 1872,
    lado: 'centro',
  },
  tarjeta: {
    texto: '',
    href: conBase('#contacto'),
    miniatura: conMedia('outfits/outfit-azul.webp'),
    alt: '',
  },
};
