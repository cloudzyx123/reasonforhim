import { getCollection } from 'astro:content';

export type Lang = 'zh' | 'en';

export const LABELS: Record<Lang, { siteName: string; home: string }> = {
  zh: { siteName: '为何是祂', home: '首页' },
  en: { siteName: 'Reason for Him', home: 'Home' },
};

/**
 * 给定当前文章的 translationId，去"另一种语言"的合集里找配对的译文。
 * 找不到（或本来就没填 translationId）就返回空数组 —— 这完全正常，
 * 不是每篇文章都需要双语配对，参见 content.config.ts 里的说明。
 */
export async function getAlternateLinks(
  currentLang: Lang,
  translationId: string | undefined
): Promise<{ lang: Lang; href: string }[]> {
  if (!translationId) return [];

  const otherLang: Lang = currentLang === 'zh' ? 'en' : 'zh';
  const otherEntries = await getCollection(
    otherLang,
    (entry) => !entry.data.draft && entry.data.translationId === translationId
  );

  return otherEntries.map((entry) => ({
    lang: otherLang,
    href: `/${otherLang}/${entry.id}/`,
  }));
}
