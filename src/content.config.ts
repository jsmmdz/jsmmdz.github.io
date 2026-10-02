import { defineCollection, reference, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { esquemaProyecto } from './lib/n4/contrato';

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
    // El caso es una lista de pasos con tipo y un color de fondo (T32): las reglas viven en
    // `lib/n4/contrato.ts`, que también importan las pruebas.
    schema: ({ image }) => esquemaProyecto(image, reference('disciplinas')),
  }),
};
