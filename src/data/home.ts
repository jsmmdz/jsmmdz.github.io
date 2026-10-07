// Textos y datos del home (N1). La diagramación es la del prototipo del autor (docs/1-PRODUCTO.md § 7, «Home
// rediseñado con su diagramación · T36», 2026-10-04): el personaje en el centro delante del titular, una
// columna de texto a cada lado y el botón «Contacto» arriba a la derecha. Los textos de las columnas los
// reescribe el autor: hasta entonces llevan [EJEMPLO] aquí, en el código, no en pantalla. Las posiciones
// salen de fabrica/proyecto/referentes/T36.json («diagramacion_autor»).

import { conBase, conMedia } from '@/lib/rutas';

export interface Enlace {
  texto: string;
  href: string;
}

/** Una cifra grande de la columna derecha con su pie. Entra como el texto, sin contar. */
export interface Dato {
  cifra: string;
  pie: string;
}

export interface DatosHome {
  /** El titular: «JSMMDZ», su usuario de Instagram, sin arroba. Es el único h1 del home. */
  nombre: string;
  /** Columna izquierda: titular de dos líneas, párrafo de dos líneas y el enlace que baja al menú. */
  columnaIzquierda: {
    /** [EJEMPLO]: lo reescribe el autor. Cada elemento es una línea (la subida entra línea por línea). */
    titular: readonly string[];
    /** [EJEMPLO]: lo reescribe el autor. */
    parrafo: readonly string[];
    /** «Ver mi trabajo»: baja al menú (lo intercepta lib/pelicula/scroll.ts). */
    cta: Enlace;
  };
  /** Columna derecha: dos cifras con su pie. [EJEMPLO]: las reescribe el autor. */
  columnaDerecha: readonly [Dato, Dato];
  /** El personaje verde de 3D, recortado. Por ahora una imagen; el modelo 3D lo cambia (lib/n1/personaje.ts). */
  personaje: {
    src: string;
    alt: string;
    ancho: number;
    alto: number;
  };
  /** Arriba a la derecha: el botón con miniatura del personaje. Lleva al formulario (`/#contacto`). */
  contacto: Enlace;
  /** Arriba a la derecha, a la izquierda del botón: lleva a la sección «Sobre mí» (T35, `/#sobre-mi`). */
  sobreMi: Enlace;
  /** Encima del titular, a la derecha: «LinkedIn / Instagram». Abren en otra pestaña. */
  linkedin: Enlace;
  instagram: Enlace;
  /** El video que se ve dentro de la tinta: «JSMMDZ» en materiales sobre negro (clip provisional). */
  materiales: { src: string };
}

// @deprecated: `home.tarjeta` ya no se dibuja en el home (la tarjeta «Trabajemos juntos» salió con Mr. BLACK).
// Sigue aquí solo porque `N0Preloader.astro` la precarga (línea 37) y N0 es de T34, que la quita. Apunta al
// mismo personaje que el home usa para que el preloader no baje la lámina azul de 800 KB. Se marca con un
// comentario y no con la etiqueta JSDoc: la etiqueta hace que `astro check` avise (hint) en N0, que no es de
// esta tarea, y la compuerta `check` exige 0 hints.
export interface DatosHomeHeredados {
  tarjeta: Enlace & { miniatura: string; alt: string };
}

const PERSONAJE = conMedia('personaje/laterales/03-verde-3d.png');

export const home: DatosHome & DatosHomeHeredados = {
  nombre: 'JSMMDZ',
  columnaIzquierda: {
    titular: ['Creación', 'digital.'], // [EJEMPLO]
    parrafo: ['Web, motion, 3D,', 'videojuegos y editorial.'], // [EJEMPLO]
    cta: { texto: 'Ver mi trabajo', href: '#disciplinas' },
  },
  columnaDerecha: [
    { cifra: '5', pie: 'Disciplinas' }, // [EJEMPLO]
    { cifra: '4', pie: 'Casos de estudio' }, // [EJEMPLO]
  ],
  personaje: {
    src: PERSONAJE,
    alt: 'El autor como personaje 3D, de cuerpo entero: chaleco acolchado verde sobre una sudadera gris, pantalón cargo oscuro y tenis verdes.',
    ancho: 1248,
    alto: 1872,
  },
  contacto: { texto: 'Contacto', href: conBase('#contacto') },
  sobreMi: { texto: 'Sobre mí', href: conBase('#sobre-mi') },
  linkedin: {
    texto: 'LinkedIn',
    href: 'https://www.linkedin.com/in/junior-smith-mejia-mendez-003a81362/',
  },
  instagram: { texto: 'Instagram', href: 'https://www.instagram.com/jsmmdz/' },
  materiales: { src: conMedia('home/jsmmdz-materiales.mp4') },

  // Heredado (@deprecated): lo precarga N0Preloader.astro hasta que T34 lo reemplace.
  tarjeta: {
    texto: '',
    href: conBase('#contacto'),
    miniatura: PERSONAJE,
    alt: '',
  },
};
