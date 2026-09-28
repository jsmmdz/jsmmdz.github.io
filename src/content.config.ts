import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';

export const collections = {
  disciplinas: defineCollection({
    loader: glob({ pattern: '**/*.json', base: './src/content/disciplinas' }),
    schema: ({ image }) =>
      z.object({
        slug: z.enum(['web', 'motion', '3d', 'videojuegos', 'editorial']),
        nombre: z.string(),
        orden: z.coerce.number().int(),
        acento: z.enum([
          '#1C3F94',
          '#E09B00',
          '#046A38',
          '#9B111E',
          '#111111',
        ]),
        fondoMenu: z.enum([
          '#AFB6CD',
          '#F0D7A1',
          '#A4C4AD',
          '#DDABAA',
          '#343A3D',
        ]),
        videoOutfit: z.string(),
        poster: image(),
        texturaCilindro: image(),
      }),
  }),
  proyectos: defineCollection({
    loader: glob({
      pattern: '**/*.mdx',
      base: './src/content/proyectos',
    }),
    schema: ({ image }) =>
      z.object({
        slug: z.string(),
        disciplina: reference('disciplinas'),
        titulo: z.string().trim().min(1, 'titulo es obligatorio'),
        anio: z.coerce.number().int(),
        rol: z.string().trim().min(1, 'rol es obligatorio'),
        idea: z.string().trim().min(1, 'idea es obligatoria'),
        problema: z.string().trim().min(1, 'problema es obligatorio'),
        aporte: z.string().trim().min(1, 'aporte es obligatorio'),
        decisiones: z
          .array(
            z.object({
              que: z.string().trim().min(1, 'que es obligatorio'),
              porque: z.string().trim().min(1, 'porque es obligatorio'),
            })
          )
          .min(1, 'decisiones debe tener al menos un elemento'),
        hallazgos: z.array(z.string()),
        portada: image(),
        orden: z.coerce.number().int(),
      }),
  }),
};
