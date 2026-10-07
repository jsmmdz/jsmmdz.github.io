/**
 * El contrato de la plantilla del N4 (docs/2-TECNICO.md § Base de datos, autor, 2026-10-01).
 *
 * Un caso se arma solo con su frontmatter: una lista de pasos con tipo (`historia`, de 4 a 12) y el color
 * del caso (`fondo`). Cada paso es un cristal a la izquierda y su foto a la derecha. Las reglas viven
 * aquí, sin depender de `astro:content`, para que `content.config.ts` las use al construir el sitio y
 * las pruebas las importen directo. Cada error nombra su campo. Corre solo en Node (al construir y en las
 * pruebas): por eso puede comprobar que un corto existe en `public/media/`.
 */
import { existsSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';
import { z } from 'astro/zod';
import { TIPOS_PASO } from './historia';

/** Cuántas palabras cabe en un cristal y cuántos caracteres en su cifra grande. */
export const MAX_PALABRAS_TEXTO = 20;
export const MAX_CARACTERES_DESTACADO = 12;
export const MIN_PASOS = 4;
/** Hasta 12 pasos (T38, autor 2026-10-04): los resultados finales con su video suman pasos al final. */
export const MAX_PASOS = 12;
/** Cuántos pasos de un caso pueden llevar el corto de su video (T38). */
export const MAX_VIDEOS = 3;
/** Colores de la sección del design system: exactamente 5 (autor, 2026-10-02). */
export const COLORES_PALETA = 5;
/** Fuentes de la sección del design system: de 1 a 3, cada una con su archivo .woff2 en `public/`. */
export const MIN_FUENTES = 1;
export const MAX_FUENTES = 3;
/** Palabras del uso de una fuente («Títulos», «Texto corrido»…). */
export const MAX_PALABRAS_USO = 4;
// Ruta relativa dentro de `sitio/public/`, sin subir de carpeta ni empezar en «/»
const ARCHIVO_FUENTE = /^(?!\/)(?!.*\.\.)[\w\-./]+\.woff2$/;

/** Contraste mínimo del crema sobre el fondo del caso (WCAG AA para texto). */
export const CONTRASTE_MINIMO = 4.5;

// El crema del texto (token --color-texto-claro): el contrato lo necesita para medir el contraste del fondo
const CREMA = '#FAF8F5';

const HEX = /^#[0-9a-fA-F]{6}$/;
// El video completo vive en Google Drive: un archivo o una carpeta, siempre por https
const ENLACE_DRIVE = /^https:\/\/drive\.google\.com\/\S+$/;

/** Carpetas donde puede estar `public/media/`: el script corre desde `sitio/` (build y pruebas) o desde la raíz. */
function carpetasMedia(): string[] {
  return [join(process.cwd(), 'public', 'media'), join(process.cwd(), 'sitio', 'public', 'media')];
}

/** ¿`corto` es un .mp4 de `public/media/`, sin salir de esa carpeta? */
function cortoEsMp4DentroDeMedia(corto: string): boolean {
  const ruta = normalize(corto).split(sep).join('/');
  const absoluta = ruta.startsWith('/') || /^[a-z]:/i.test(ruta);
  return /\.mp4$/i.test(ruta) && !absoluta && ruta !== '..' && !ruta.startsWith('../');
}

/** ¿El corto existe dentro de alguna carpeta `public/media/`? */
function cortoExiste(corto: string): boolean {
  return carpetasMedia().some((base) => existsSync(join(base, normalize(corto))));
}

/** Luminancia relativa de WCAG de un color `#RRGGBB`. */
export function luminancia(hex: string): number {
  const canal = (i: number) => {
    const s = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(0) + 0.7152 * canal(1) + 0.0722 * canal(2);
}

/** Contraste de WCAG entre dos colores `#RRGGBB`. */
export function contraste(a: string, b: string): number {
  const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (claro + 0.05) / (oscuro + 0.05);
}

const palabras = (t: string) => t.split(/\s+/).filter(Boolean).length;

/** El esquema de un paso de la historia. `image` es el `image()` de Astro (o un sustituto en las pruebas). */
function esquemaPaso<I extends z.ZodTypeAny>(image: () => I) {
  return z.object({
    tipo: z.enum(TIPOS_PASO, { errorMap: () => ({ message: `tipo no válido: usa ${TIPOS_PASO.join(', ')}` }) }),
    destacado: z
      .string()
      .trim()
      .max(MAX_CARACTERES_DESTACADO, `destacado pasa de ${MAX_CARACTERES_DESTACADO} caracteres`)
      .optional(),
    texto: z
      .string()
      .trim()
      .min(1, 'texto es obligatorio')
      .refine((t) => palabras(t) <= MAX_PALABRAS_TEXTO, `texto pasa de ${MAX_PALABRAS_TEXTO} palabras`),
    foto: image(),
    alt: z.string().trim().min(1, 'alt es obligatorio: describe la foto'),
    // El corto que reemplaza la foto del paso y el enlace al video completo (T38). Solo en pasos `resultado`.
    video: z
      .object({
        corto: z
          .string()
          .trim()
          .refine(cortoEsMp4DentroDeMedia, 'video.corto debe ser un .mp4 dentro de public/media/ (ruta relativa, sin salir de la carpeta)')
          .refine((c) => !cortoEsMp4DentroDeMedia(c) || cortoExiste(c), 'video.corto no existe en public/media/'),
        enlace: z.string().trim().regex(ENLACE_DRIVE, 'video.enlace debe empezar con https://drive.google.com/'),
      })
      .optional(),
  });
}

/**
 * El esquema de un caso. `disciplina` es `z.string()` por omisión; `content.config.ts` le pasa su
 * `reference('disciplinas')`.
 */
export function esquemaProyecto<I extends z.ZodTypeAny, D extends z.ZodTypeAny = z.ZodString>(
  image: () => I,
  disciplina?: D,
) {
  return z
    .object({
      slug: z.string(),
      disciplina: disciplina ?? z.string(),
      titulo: z.string().trim().min(1, 'titulo es obligatorio'),
      anio: z.coerce.number().int(),
      portada: image(),
      // Portada en video (opcional): ruta relativa a /media, MP4. La tarjeta del N3 la usa como textura
      // y deja la imagen de portada como póster y como respaldo si el video falla.
      video: z.string().trim().min(1).optional(),
      fondo: z
        .string()
        .regex(HEX, 'fondo debe ser un color #RRGGBB')
        .refine((c) => !HEX.test(c) || contraste(CREMA, c) >= CONTRASTE_MINIMO, `fondo no da ${CONTRASTE_MINIMO}:1 de contraste con el crema del texto`),
      historia: z
        .array(esquemaPaso(image))
        .min(MIN_PASOS, `historia debe tener al menos ${MIN_PASOS} pasos`)
        .max(MAX_PASOS, `historia admite a lo sumo ${MAX_PASOS} pasos`),
      orden: z.coerce.number().int(),
      // La exposición del design system (opcional, autor, 2026-10-02): a pantalla completa, antes del
      // resultado; la paleta a la izquierda (5 cristales teñidos con su hexadecimal) y las tipografías a la
      // derecha, en un cristal grande, escritas en su fuente real. Sin el campo, la sección no existe.
      designSystem: z
        .object({
          paleta: z
            .array(z.string().regex(HEX, 'designSystem.paleta: cada color debe ser #RRGGBB'))
            .length(COLORES_PALETA, `designSystem.paleta debe tener exactamente ${COLORES_PALETA} colores`),
          fuentes: z
            .array(
              z.object({
                nombre: z.string().trim().min(1, 'designSystem.fuentes: falta el nombre'),
                uso: z
                  .string()
                  .trim()
                  .min(1, 'designSystem.fuentes: falta el uso')
                  .refine((t) => palabras(t) <= MAX_PALABRAS_USO, `designSystem.fuentes: el uso pasa de ${MAX_PALABRAS_USO} palabras`),
                archivo: z.string().regex(ARCHIVO_FUENTE, 'designSystem.fuentes: el archivo debe ser un .woff2 dentro de public/ (ruta relativa)'),
              }),
            )
            .min(MIN_FUENTES, `designSystem.fuentes debe tener al menos ${MIN_FUENTES} fuente`)
            .max(MAX_FUENTES, `designSystem.fuentes admite a lo sumo ${MAX_FUENTES} fuentes`),
        })
        .optional(),
      // La sección de resultados (autor, 2026-10-06; hoy solo Bernarte): los pasos con video salen de la historia y
      // van juntos, cada corto en su marco, a pantalla completa en el tramo de la sección, antes del paso que los sigue
      galeria: z.boolean().optional(),
    })
    .superRefine((caso, ctx) => {
      const pasos = caso.historia;
      if (pasos.length === 0) return;
      // Cada regla nombra el campo y el tipo que falta: «ningún resultado sin contexto» (§ 3 de 1-PRODUCTO)
      if (pasos[0].tipo !== 'idea') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['historia', 0, 'tipo'], message: 'historia: el primer paso debe ser de tipo idea' });
      }
      if (pasos[pasos.length - 1].tipo !== 'resultado') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['historia', pasos.length - 1, 'tipo'], message: 'historia: el último paso debe ser de tipo resultado' });
      }
      // El video solo acompaña a un resultado, y no más de MAX_VIDEOS por caso
      pasos.forEach((p, i) => {
        if (p.video && p.tipo !== 'resultado') {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['historia', i, 'video'], message: 'historia: video solo va en pasos de tipo resultado' });
        }
      });
      if (pasos.filter((p) => p.video).length > MAX_VIDEOS) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['historia'], message: `historia: a lo sumo ${MAX_VIDEOS} pasos pueden llevar video` });
      }
      if (caso.galeria) {
        const conVideo = pasos.flatMap((p, i) => (p.video ? [i] : []));
        if (caso.designSystem) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['galeria'], message: 'galeria: no va con designSystem (las dos usan el tramo de la sección)' });
        }
        if (conVideo.length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['galeria'], message: 'galeria: necesita al menos 2 pasos con video' });
        } else if (conVideo[conVideo.length - 1] - conVideo[0] !== conVideo.length - 1) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['galeria'], message: 'galeria: los pasos con video van seguidos' });
        }
      }
      for (const tipo of ['problema', 'rol'] as const) {
        if (!pasos.some((p) => p.tipo === tipo)) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['historia'], message: `historia: falta un paso de tipo ${tipo}` });
        }
      }
    });
}
