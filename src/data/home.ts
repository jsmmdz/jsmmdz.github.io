// Textos y datos del home (N1). La diagramación es la del prototipo del autor (docs/1-PRODUCTO.md § 7, «Home
// rediseñado con su diagramación · T36», 2026-10-04): el personaje en el centro (desde T44, un video detrás del
// titular), una columna de texto a cada lado y el botón «Contacto» arriba a la derecha. Los textos de las columnas son del autor
// (docs/1-PRODUCTO.md § 7, «Los textos del home», 2026-10-13). Las posiciones salen de
// fabrica/proyecto/referentes/T36.json («diagramacion_autor»).

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
    /** Cada elemento es una línea (la subida entra línea por línea). */
    titular: readonly string[];
    /** Dos líneas cortas (≤ 27 letras): más largas se parten y empujan el enlace. */
    parrafo: readonly string[];
    /** «Ver los casos»: baja al menú (lo intercepta lib/pelicula/scroll.ts). */
    cta: Enlace;
  };
  /** Columna derecha: dos cifras con su pie. La primera la actualiza el autor al publicar un caso; la segunda es el
   *  dato vivo del home pintado (T44): aquí va su valor inicial. */
  columnaDerecha: readonly [Dato, Dato];
  /**
   * El personaje animado del home (T44). `src` es el póster (el primer cuadro del video, con transparencia): marca
   * la caja del personaje y es lo que se ve mientras el canvas de la tinta no lo dibuja. `video` es el mp4 de color
   * (mitad izquierda, premultiplicado) y máscara (mitad derecha). `miniatura` es la del botón «Contacto».
   */
  personaje: {
    src: string;
    alt: string;
    /** Tamaño del cuadro del póster y de cada mitad del video, en px. */
    ancho: number;
    alto: number;
    video: string;
    miniatura: string;
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
// misma miniatura del botón «Contacto» del home, así el preloader baja una imagen chica. Se marca con un
// comentario y no con la etiqueta JSDoc: la etiqueta hace que `astro check` avise (hint) en N0, que no es de
// esta tarea, y la compuerta `check` exige 0 hints.
export interface DatosHomeHeredados {
  tarjeta: Enlace & { miniatura: string; alt: string };
}

const POSTER = conMedia('home/personaje/personaje-home-poster.webp');
const MINIATURA = conMedia('home/personaje/personaje-home-miniatura.webp');

export const home: DatosHome & DatosHomeHeredados = {
  nombre: 'JSMMDZ',
  columnaIzquierda: {
    titular: ['Aprendo', 'jugando.'],
    parrafo: ['Soy Junior. Nada de esto', 'lo sabía hacer antes.'],
    cta: { texto: 'Ver los casos', href: '#disciplinas' },
  },
  columnaDerecha: [
    { cifra: '55 %', pie: 'Del sitio construido' },
    { cifra: '0 %', pie: 'Pintado por ti' },
  ],
  personaje: {
    src: POSTER,
    alt: 'El autor como personaje 3D, de cuerpo entero: puffer negro corto con un panel azul en diagonal, el logo «Creación Digital» en el pecho y una correa ámbar, pantalón negro ancho con un bolsillo verde y tenis negros con suela crema.',
    ancho: 1080,
    alto: 1920,
    video: conMedia('home/personaje/personaje-home-mascara.mp4'),
    miniatura: MINIATURA,
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
    miniatura: MINIATURA,
    alt: '',
  },
};
