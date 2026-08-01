import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// 公共的文章 schema：中英文文章共用同一套字段
const postSchema = z.object({
  title: z.string(),
  description: z.string(),
  // 发布日期，写成 2026-07-31 这样的格式即可，Astro 会自动解析
  pubDate: z.coerce.date(),
  updatedDate: z.coerce.date().optional(),
  // 文章分类，方便你以后按"护教""释经""神学"等做归档
  tags: z.array(z.string()).default([]),
  // 草稿开关：设为 true 的文章不会出现在列表页和构建产物里
  draft: z.boolean().default(false),
  // ↓↓↓ 双语配对的关键字段 ↓↓↓
  // 如果这篇文章"确实"是另一篇的翻译，两边填同一个 translationId，
  // hreflang 标签就会自动在两个页面之间互相声明。
  // 如果这篇文章没有对应译文（比如你写的是独立的中文选题），留空即可，不必强行配对。
  translationId: z.string().optional(),
});

const zh = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/zh' }),
  schema: postSchema,
});

const en = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/en' }),
  schema: postSchema,
});

export const collections = { zh, en };
