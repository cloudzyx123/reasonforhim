import rss from '@astrojs/rss';
import { statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { coverImagePattern } from './cover-path.mjs';
import { eligibleArticles } from './syndication.mjs';

const IMAGE_TYPES = {
  '.avif': 'image/avif', '.gif': 'image/gif', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg',
  '.png': 'image/png', '.webp': 'image/webp',
};

export function distributionFeed({ catalog, site, now = Date.now(), cwd = process.cwd() }) {
  const items = eligibleArticles(catalog, now).filter(article => article.lang === 'zh').reverse().map(article => {
    const cover = article.coverImage;
    const image = typeof cover === 'string' && coverImagePattern.test(cover)
      ? statSync(join(cwd, 'public', cover.slice(1)), { throwIfNoEntry: false })
      : undefined;
    return {
      title: article.title,
      // Brevo places the RSS description into HTML.
      description: article.description.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
      link: article.url,
      pubDate: new Date(article.release.at),
      customData: `<guid isPermaLink="false">urn:reasonforhim:article:${article.stableId}</guid>`,
      enclosure: image?.isFile() ? {
        url: new URL(cover, site).href,
        length: image.size,
        type: IMAGE_TYPES[extname(cover).toLowerCase()],
      } : undefined,
    };
  });
  return rss({
    title: '为何是祂 · 新文章',
    description: '福音、护教、释经与神学新文章',
    site,
    customData: '<language>zh-CN</language>',
    items,
  });
}
