// Textos y datos del home (N1). Los escribe el orquestador; el constructor los lee y no los
// edita. TODOS los textos son provisionales (D13, 2026-09-26: «por el momento solo estructura con
// contenido relacionado»). Los visibles en grande ya no llevan [TEXTO DEL AUTOR]: en display el
// marcador rompía la composición. Los reemplaza el autor antes de T17. La distribución sale de
// referencias/frames/tablero/mrblack-01-home.jpg.

export interface Enlace {
  texto: string;
  href: string;
}

export interface DatosHome {
  /** El nombre: el h1 y la marca gigante de abajo, a todo el ancho. */
  nombre: string;
  /** Bloque de arriba a la izquierda (Mr. BLACK: «MR.BLACK FRANCHISE»). */
  titulo: string;
  descripcion: string;
  /** El typewriter (R26, Mainframe) escribe estas líneas debajo de la descripción. */
  lineasTypewriter: readonly string[];
  /** El enlace del bloque de arriba a la izquierda (Mr. BLACK: «APPLY NOW»). */
  enlacePrincipal: Enlace;
  /** Navegación de arriba a la izquierda. */
  navegacion: readonly Enlace[];
  /** Enlace de arriba a la derecha (Mr. BLACK: «CONTACTS»). */
  contacto: Enlace;
  /** Tarjeta con miniatura de arriba a la derecha (Mr. BLACK: «CONTACT US»). */
  tarjeta: Enlace & { miniatura: string; alt: string };
  /** Las dos cifras grandes de la derecha. */
  cifras: readonly { valor: string; rotulo: string }[];
  /**
   * El autor, al centro, delante de la marca gigante. Hoy es un marcador: el autor va a poner
   * su imagen y una mecánica para que su mirada siga el cursor (D13).
   */
  personaje: {
    src: string;
    alt: string;
    ancho: number;
    alto: number;
    lado: 'izquierda' | 'derecha' | 'centro';
  };
  /** Compatibilidad con T3a. */
  textoIrADisciplinas: string;
}

import { conBase, conMedia } from '@/lib/rutas';

export const home: DatosHome = {
  nombre: 'JSMMDZ',
  titulo: 'Portafolio 2026',
  descripcion: '[EJEMPLO] Diseñador y desarrollador en cinco disciplinas: web, motion, 3D, videojuegos y editorial.',
  lineasTypewriter: [
    'Hola, soy Junior Mejía.',
    '[EJEMPLO] Cada disciplina tiene su propio mundo, y yo me cambio de ropa para entrar.',
    'Baja y elige por dónde empezar.',
  ],
  enlacePrincipal: { texto: 'Ver mi trabajo', href: '#disciplinas' },
  navegacion: [
    { texto: 'Disciplinas', href: '#disciplinas' },
    { texto: 'Diseño web', href: conBase('web/') },
    { texto: 'Motion graphics', href: conBase('motion/') },
    { texto: '3D', href: conBase('3d/') },
  ],
  contacto: { texto: 'Contacto', href: conBase('#contacto') },
  tarjeta: {
    texto: 'Trabajemos juntos',
    href: conBase('#contacto'),
    miniatura: conMedia('outfits/outfit-azul.webp'),
    alt: '',
  },
  cifras: [
    { valor: '5', rotulo: 'Disciplinas en un solo portafolio' },
    { valor: '1', rotulo: 'Personaje que cambia de outfit en cada una' },
  ],
  personaje: {
    src: conMedia('personaje/laterales/01-azul-web.png'),
    alt: '[TEXTO DEL AUTOR] El autor, con el outfit de diseño web.',
    ancho: 1248,
    alto: 1872,
    lado: 'centro',
  },
  textoIrADisciplinas: '[TEXTO DEL AUTOR] Ver disciplinas',
};
