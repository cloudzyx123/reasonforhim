import { getCollection } from 'astro:content';
import { compareArticles } from './article-list.mjs';
import { getSection, SECTION_IDS, SECTIONS } from './editorial';
import type { Lang } from './i18n';

export async function catalogue(lang: Lang) {
  const posts = (await getCollection(lang, ({ data }) => !data.draft)).sort((a, b) =>
    compareArticles({ id: a.id, date: +a.data.pubDate }, { id: b.id, date: +b.data.pubDate })
  );
  const sections = SECTION_IDS.map(id => ({
    id,
    ...SECTIONS[id][lang],
    count: posts.filter(post => getSection(post) === id).length,
  }));
  return { posts, sections };
}

export function formatEssayDate(date: Date, lang: Lang) {
  return date.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-GB', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  });
}
