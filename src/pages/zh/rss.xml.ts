import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import type { APIContext } from 'astro';

export async function GET(context: APIContext) {
  const posts = await getCollection('zh', (entry) => !entry.data.draft);
  return rss({
    title: '你的博客名',
    description: '福音、护教、释经与神学文章',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: `/zh/${post.id}/`,
    })),
  });
}
