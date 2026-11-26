import type { APIRoute } from 'astro';
import { publicDir } from 'astro:config/server';
import { getCollection } from 'astro:content';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { listCoverResolver } from '../../../lib/list-covers';

export async function getStaticPaths() {
  const paths = await Promise.all((['zh', 'en'] as const).map(async lang => {
    const resolveCover = listCoverResolver(publicDir, lang);
    const posts = await getCollection(lang, post => !post.data.draft);
    return Promise.all(posts.map(async post => {
      const cover = await resolveCover(post, 'home');
      return cover ? { params: { lang, slug: post.id }, props: { src: cover.src } } : undefined;
    }));
  }));
  return paths.flat().filter(path => path !== undefined);
}

export const GET: APIRoute<{ src: string }> = async ({ props }) => {
  const file = fileURLToPath(new URL(`.${props.src}`, publicDir));
  const image = await sharp(file)
    .autoOrient()
    .resize(1200, 630, { fit: 'contain', background: '#f6f2e9' })
    .flatten({ background: '#f6f2e9' })
    .jpeg({ quality: 85 })
    .toBuffer();
  return new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/jpeg' } });
};
