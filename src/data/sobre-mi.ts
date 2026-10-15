// Textos y datos de la sección «Sobre mí y contacto», calcada de Tonami & Ayano (T45; docs/1-PRODUCTO.md § 7,
// decisiones del autor del 2026-10-14). Los textos que el autor todavía no escribe llevan [EJEMPLO] aquí, en el
// código, no en pantalla, y están en los PENDIENTES de la entrega: la portada, el perfil, la personalidad, los
// cuatro semestres con sus «¿Sabías que?», el interludio y la presentación de la tarjeta salen de una entrevista
// en el pulido. Las imágenes de la historia son de `src/assets/proyectos/` (hasta que el autor elija las suyas) y
// la del personaje es la del home.

import { conMedia } from '@/lib/rutas';
import { bloquear } from '@/lib/sobre-mi/bloqueo';
import { SOBRE_MI_BLOQUEADA } from '@/lib/sobre-mi/visible';
import { home } from '@/data/home';
import guiaPortada from '@/assets/proyectos/guia-de-campo-creador-digital/portada.webp';
import guiaRol from '@/assets/proyectos/guia-de-campo-creador-digital/03-rol.webp';
import guiaProceso from '@/assets/proyectos/guia-de-campo-creador-digital/06-proceso.webp';
import malcriadoPortada from '@/assets/proyectos/malcriado/portada.webp';
import malcriadoProceso from '@/assets/proyectos/malcriado/04-proceso.webp';
import malcriadoDecision from '@/assets/proyectos/malcriado/07-decision.webp';
import elenitaPortada from '@/assets/proyectos/elenita-y-sus-manchitas/portada.webp';
import elenitaProceso from '@/assets/proyectos/elenita-y-sus-manchitas/04-proceso.webp';
import elenitaResultado from '@/assets/proyectos/elenita-y-sus-manchitas/09-resultado.webp';
import bernartePortada from '@/assets/proyectos/bernarte/portada.webp';
import bernarteProceso from '@/assets/proyectos/bernarte/04-proceso.webp';
import bernarteResultado from '@/assets/proyectos/bernarte/08-resultado.webp';

export interface ImagenHistoria {
  src: string;
  /** Dimensiones reales: el shader de película las usa para recortar (cover) y el <img> reserva su alto. */
  ancho: number;
  alto: number;
  alt: string;
  /** El pie de foto, en la placa junto al círculo. */
  pie: string;
}

export interface Capitulo {
  /** El semestre, como lo nombran los botones: «2025-1». */
  id: string;
  /** El semestre grande, con un dígito por columna: «2025.1». */
  digitos: string;
  /** El rótulo con la banda: «(2025-1) Los primeros pasos». */
  rotulo: string;
  texto: string;
  /** El segundo texto, abajo a la derecha (en Tonami, el inglés). */
  extra: string;
  /** El dato de «¿Sabías que?». */
  sabias: string;
  /** De 1 a 4 imágenes de proyectos de ese semestre. */
  imagenes: readonly ImagenHistoria[];
}

const imagen = (m: ImageMetadata, alt: string, pie: string): ImagenHistoria => ({ src: m.src, ancho: m.width, alto: m.height, alt, pie });

const CORREO = 'juniiormejia04@gmail.com';

const datos = {
  /** El rótulo vertical de cada riel, por bloque (K7, en español). */
  rieles: {
    portada: { izquierdo: 'Bienvenida', derecho: 'Portafolio de creación digital' },
    'sobre-mi': { izquierdo: 'Perfil', derecho: 'Quién soy' },
    historia: { izquierdo: 'Historia', derecho: 'De 2025 a hoy' },
    contacto: { izquierdo: 'Contacto', derecho: 'Escríbeme' },
  },
  interruptor: { nombre: 'Modo noche', dia: 'Día', noche: 'Noche' },

  portada: {
    /** La palabra gigante, de lado a lado (en Tonami, «WEDDING»). [EJEMPLO] */
    palabra: 'CREADOR',
    nombre: ['junior', 'mejía'],
    imagen: {
      src: conMedia('home/personaje/personaje-home-poster.webp'),
      alt: 'El personaje del portafolio, de pie, con un puffer negro con panel azul y la correa ámbar.',
      ancho: home.personaje.ancho,
      alto: home.personaje.alto,
    },
    anios: ['2025', '2026'],
    /** La fecha y el lugar, dispersos en escalera (K5). `yCel` es la altura a 390: «en» y «bogotá» van bajo la píldora
     *  de 2025, que a esa altura cae encima. [EJEMPLO] */
    dispersos: [
      { lineas: ['20', '26'], x: 2.8, y: 34, yCel: 34 },
      { lineas: ['(creación)'], x: 7, y: 43, yCel: 43 },
      { lineas: ['en'], x: 15, y: 61.5, yCel: 66 },
      { lineas: ['bogotá'], x: 19, y: 66.5, yCel: 70 },
    ],
    /** La invitación, en placa. [EJEMPLO] */
    invitacion: 'Este portafolio reúne lo que he aprendido creando, semestre a semestre.',
    codigo: { rotulo: 'JSMMDZ-2026' },
    baja: 'Baja',
    interaccion: 'Sigue bajando para conocerme',
  },

  sobre: {
    titulo: 'Sobre mí',
    rotulo: '(Quién soy)',
    rol: 'Creador digital',
    nombre: 'Junior',
    apellido: 'Mejía',
    foto: {
      src: conMedia('home/personaje/personaje-home-poster.webp'),
      alt: 'El personaje del portafolio, de cuerpo entero, sobre un fondo ciruela.',
      ancho: home.personaje.ancho,
      alto: home.personaje.alto,
    },
    perfil: {
      rotulo: 'Perfil',
      lineas: [
        'Creador digital en Bogotá.',
        'Estudio Creación Digital y trabajo en cinco disciplinas.',
        'Diseño, animo y construyo, y lo junto en una sola mirada.',
      ], // [EJEMPLO]
    },
    personalidad: {
      rotulo: 'Personalidad',
      puntos: ['Me gusta aprender mientras creo.', 'Pruebo primero y pregunto después.'], // [EJEMPLO]
    },
  },

  puente: {
    /** Las siete palabras que se dispersan; «mi historia» es el título (K12). [EJEMPLO] */
    palabras: ['lo que sigue', 'es', 'mi historia', 'desde', '2025', 'hasta', 'hoy'],
    titulo: 3,
  },

  historia: {
    titulo: 'Mi historia',
    rotulo: '(Semestre a semestre)',
    anioEtiqueta: 'Semestre',
    sabiasRotulo: '¿Sabías que?',
    botones: { anterior: 'Anterior', siguiente: 'Siguiente', saltar: 'Saltar' },
    aniosTitulo: 'Semestres',
    /** El interludio del cierre (K18). [EJEMPLO] */
    interludio: 'Cuatro semestres, y ahora, escríbeme',
    capitulos: [
      {
        id: '2025-1',
        digitos: '2025.1',
        rotulo: '(2025-1) Los primeros pasos',
        texto: 'Aquí va lo que pasó este semestre: lo que aprendí y lo que construí.',
        extra: 'El primer semestre fue de probar cosas sin saber si saldrían bien.',
        sabias: 'Aquí va un dato curioso de este semestre.',
        imagenes: [
          imagen(guiaPortada, 'Portada de un proyecto de este semestre.', 'Un proyecto del semestre.'),
          imagen(guiaRol, 'Una pieza de un proyecto de este semestre.', 'Una pieza del mismo proyecto.'),
          imagen(guiaProceso, 'El proceso de un proyecto de este semestre.', 'El proceso, a medias.'),
        ],
      },
      {
        id: '2025-2',
        digitos: '2025.2',
        rotulo: '(2025-2) Tomando forma',
        texto: 'Aquí va lo que pasó este semestre: lo que aprendí y lo que construí.',
        extra: 'El segundo semestre fue de repetir hasta que algo empezó a verse propio.',
        sabias: 'Aquí va otro dato curioso, el de este semestre.',
        imagenes: [
          imagen(malcriadoPortada, 'Portada de un proyecto de este semestre.', 'Un proyecto del semestre.'),
          imagen(malcriadoProceso, 'El proceso de un proyecto de este semestre.', 'El proceso, a medias.'),
          imagen(malcriadoDecision, 'Una decisión de un proyecto de este semestre.', 'Una decisión de diseño.'),
        ],
      },
      {
        id: '2026-1',
        digitos: '2026.1',
        rotulo: '(2026-1) Con más oficio',
        texto: 'Aquí va lo que pasó este semestre: lo que aprendí y lo que construí.',
        extra: 'El tercer semestre fue de hacer más y mejor, con menos miedo.',
        sabias: 'Aquí va el dato curioso de este semestre.',
        imagenes: [
          imagen(elenitaPortada, 'Portada de un proyecto de este semestre.', 'Un proyecto del semestre.'),
          imagen(elenitaProceso, 'El proceso de un proyecto de este semestre.', 'El proceso, a medias.'),
          imagen(elenitaResultado, 'El resultado de un proyecto de este semestre.', 'El resultado.'),
        ],
      },
      {
        id: '2026-2',
        digitos: '2026.2',
        rotulo: '(2026-2) Hasta hoy',
        texto: 'Aquí va lo que pasó este semestre: lo que aprendí y lo que construí.',
        extra: 'El cuarto semestre es el de ahora: aprender mientras se publica.',
        sabias: 'Aquí va el último dato curioso.',
        imagenes: [
          imagen(bernartePortada, 'Portada de un proyecto de este semestre.', 'Un proyecto del semestre.'),
          imagen(bernarteProceso, 'El proceso de un proyecto de este semestre.', 'El proceso, a medias.'),
          imagen(bernarteResultado, 'El resultado de un proyecto de este semestre.', 'El resultado.'),
        ],
      },
    ] satisfies readonly Capitulo[],
  },

  contacto: {
    titulo: 'Escríbeme',
    subtitulo: 'Cuéntame qué tienes en mente',
    tarjeta: {
      texto: [
        'Si hay algo que quieras construir, animar o diseñar, escríbeme.',
        'Te respondo en uno o dos días.',
      ], // [EJEMPLO]
      correoRotulo: 'Correo',
      redesRotulo: 'Redes',
    },
    /** El correo se ve como texto que se copia: nunca como enlace `mailto:` (decisión del autor, T35). */
    correo: CORREO,
    redes: [
      { texto: home.linkedin.texto, href: home.linkedin.href },
      { texto: home.instagram.texto, href: home.instagram.href },
    ],
    formulario: {
      etiquetas: { nombre: '1. Nombre*', empresa: '2. Empresa', correo: '3. Correo*', mensaje: '4. Mensaje*' },
      opcional: '(opcional)',
      autorizacion: 'Autorizo el uso de mis datos personales para que me respondas, según la Ley 1581 de 2012.',
      boton: 'Enviar',
      /** El resumen de errores que lee el lector de pantalla (K23): «4 campos por corregir. Te llevé a Nombre.» */
      resumen: { uno: 'campo por corregir', varios: 'campos por corregir', llevar: 'Te llevé a' },
      campos: { name: 'Nombre', email: 'Correo', message: 'Mensaje', autorizacion: 'la autorización' },
      errores: {
        nombre: 'Escribe tu nombre, de 2 caracteres o más.',
        correoVacio: 'Escribe tu correo.',
        correoInvalido: 'Revisa el correo: parece incompleto.',
        mensaje: 'El mensaje necesita 10 caracteres o más.',
        autorizacion: 'Marca la autorización de datos para poder responderte.',
      },
      enviando: { titulo: 'Enviando tu mensaje…', texto: 'Un momento, por favor.' },
      gracias: {
        titulo: '¡Gracias!',
        texto: 'Recibí tu mensaje. Te respondo en breve.', // [EJEMPLO]
        cerrar: 'Cerrar',
        palabras: ['¡Gracias!', '¡Listo!', '¡Genial!', '¡Un abrazo!', '¡Hasta pronto!'],
      },
      fallo: {
        titulo: 'No se pudo enviar',
        texto: 'Hubo un problema al enviar tu mensaje. Puedes intentarlo otra vez o escribirme a',
        reintentar: 'Intentar otra vez',
        cerrar: 'Cerrar',
      },
    },
  },

  /**
   * Web3Forms: `endpoint` y `claveAcceso`. La clave es pública por diseño del servicio (queda en el HTML a
   * propósito). Es la del autor desde el pulido de T35 (2026-10-05). Las pruebas interceptan el envío: ninguna
   * manda correos.
   */
  web3forms: {
    endpoint: 'https://api.web3forms.com/submit',
    claveAcceso: 'ee2f73e0-f311-4a85-b06a-7408d3cca2a2',
    asunto: 'Mensaje nuevo desde el portafolio',
    remitente: 'Portafolio JSMMDZ',
  },
} as const;

/** Bloqueada en GitHub Pages (autor, 2026-10-15): el mismo objeto con el texto en «X» (`lib/sobre-mi/bloqueo.ts`). */
export const sobreMi: typeof datos = SOBRE_MI_BLOQUEADA ? bloquear(datos) : datos;

export type DatosSobreMi = typeof sobreMi;
