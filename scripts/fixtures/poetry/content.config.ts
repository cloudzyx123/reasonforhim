import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { collections as articles } from '../../../src/content.config';

export const collections = {
  zh: defineCollection({
    schema: articles.zh.schema,
    loader: glob({ pattern: '*.md', base: './zh' }),
  }),
  en: defineCollection({
    schema: articles.en.schema,
    loader: glob({ pattern: '*.md', base: './en' }),
  }),
};
