import type { Lang } from './i18n';

export const SECTION_IDS = ['faith', 'scripture', 'literature', 'life'] as const;
export type SectionId = typeof SECTION_IDS[number];

export const SECTIONS: Record<SectionId, Record<Lang, { title: string; description: string }>> = {
  faith: {
    zh: { title: '护教与理性', description: '在追问与对话中，寻找相信的理由。' },
    en: { title: 'Faith & reason', description: 'Honest questions and reasons to believe.' },
  },
  scripture: {
    zh: { title: '圣经与神学', description: '细读经文，认识福音与恩典。' },
    en: { title: 'Scripture & theology', description: 'Reading Scripture, exploring grace.' },
  },
  literature: {
    zh: { title: '文学与想象', description: '在诗歌、故事与想象中，聆听信仰的回声。' },
    en: { title: 'Literature & imagination', description: 'The echoes of faith in poetry and stories.' },
  },
  life: {
    zh: { title: '见证与生活', description: '在真实的人生里，遇见信仰的力量。' },
    en: { title: 'Witness & life', description: 'Faith encountered in ordinary lives.' },
  },
};

// Existing essays keep their original frontmatter and tags. New essays can set `section`.
const essaySections: Record<string, SectionId> = {
  'a-kid-asks-if-my-parents-dont-believe-in-jesus-can-they-go-to-heaven': 'faith',
  'a-painful-letter-of-recovery-rethinking-church-liberalization-and-lgbt-movement': 'scripture',
  'augustine-confessions-astrology-confusion-three-modern-versions': 'faith',
  'chapter-1-your-kingdom-come': 'scripture',
  'chapter-3-price-of-the-masses': 'scripture',
  'christmas-true-meaning-incarnation-thoughts-through-the-ages': 'scripture',
  'confidence-behind-rationality-science-atheism-faith-issue': 'faith',
  'free-grace': 'scripture',
  'god-is-dead-chesterton-vs-nietzsche': 'faith',
  'how-can-you-say-only-one-true-faith': 'faith',
  'if-i-were-paralyzed-a-poems-gospel-reflection': 'literature',
  'laurence-a-martyr-died-from-telling-jokes': 'life',
  'lewis-and-tolkien-debate-myths-and-lies': 'literature',
  'neglected-fairy-tale-master-and-removed-easter-eggs': 'literature',
  'satirical-poem-modern-people-creed-steve-turner': 'literature',
  'six-modern-concepts-created-by-christianity': 'faith',
  'three-objections-to-fairy-tales-and-cs-lewiss-response': 'literature',
  'who-can-give-peace-to-betrayers-cannibals-and-murderers': 'life',
  'why-the-bible-descriptions-of-heaven-are-superficial': 'scripture',
  'yang-xiaokai-3-processes-of-knowing-christianity': 'life',
  'zi-li-xuan-min-chapter-2': 'scripture',
};

export function getSection(post: { id: string; data: { section?: SectionId } }): SectionId {
  return post.data.section ?? essaySections[post.id] ?? 'faith';
}

export function getShareImage(post: { id: string; data: { section?: SectionId } }): string {
  const cover = EDITORIAL_COVERS[post.id];
  const key = cover ? cover.src.split('/').pop()!.replace('.webp', '')
    : getSection(post) === 'faith' ? 'reason' : getSection(post) === 'literature' ? 'dialogue' : 'grace';
  return `/share/${key}.jpg`;
}

export const EDITORIAL_COVERS: Record<string, { src: string; zh: string; en: string }> = {
  'if-i-were-paralyzed-a-poems-gospel-reflection': {
    src: '/images/editorial/grace.webp',
    zh: '版画：一位旅人穿过石拱门，走向晨光中的山丘。',
    en: 'An engraving of a traveler walking through a stone arch toward the dawn.',
  },
  'god-is-dead-chesterton-vs-nietzsche': {
    src: '/images/editorial/dialogue.webp',
    zh: '版画：书房中相对而置的两把椅子与一本展开的书。',
    en: 'An engraving of two chairs facing one another across an open book.',
  },
  'confidence-behind-rationality-science-atheism-faith-issue': {
    src: '/images/editorial/reason.webp',
    zh: '版画：拱窗下展开的书、望远镜与星空。',
    en: 'An engraving of an open book and telescope beneath a starry sky.',
  },
};
