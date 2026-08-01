import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('en', (entry) => !entry.data.draft);
  return rss({
    title: 'Your Blog Name',
    description: 'Gospel, apologetics, exegesis, and theology',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/en/${post.id}/`,
    })),
  });
}
