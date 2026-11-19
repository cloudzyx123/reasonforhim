import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { EDITORIAL_COVERS, getSection, type SectionId } from './editorial';
import type { Lang } from './i18n';

// These images were checked in the article and at the list's 4:3 crop. Keep the
// language in the key so each thumbnail comes from that version of the article.
const bodyCovers: Record<string, { src: string; alt: string; position?: string }> = {
  'zh/ai-faith-john-lennox': {
    src: '/images/ai-faith-john-lennox/bruegel-tower-of-babel.webp',
    alt: '老彼得·勃鲁盖尔的《巴别塔》，巨塔在港口的城市中层层升起。',
  },
  'zh/if-i-were-paralyzed-a-poems-gospel-reflection': {
    src: '/images/if-i-were-paralyzed-a-poems-gospel-reflection/ewl5awlno.webp',
    alt: '詹姆斯·蒂索的画作中，几个人用布兜把瘫子从房顶放下。',
    position: '50% 27%',
  },
  'zh/israeli-stamps-isaiah-hope': {
    src: '/images/israeli-stamps-isaiah-hope/israel-stamps-1962-full-tabs.jpg',
    alt: '作者收藏的三枚1962年以色列邮票，分别描绘狼与羊羔、豹与山羊羔、婴孩与蛇。',
  },
  'zh/laurence-a-martyr-died-from-telling-jokes': {
    src: '/images/laurence-a-martyr-died-from-telling-jokes/65w8ck3r8.webp',
    alt: '弗拉·安杰利科的壁画局部，劳伦斯站在坐于拱龛下的瓦勒良面前。',
    position: '50% 18%',
  },
  'zh/sam-kamaleson-street-testimony': {
    src: '/images/sam-kamaleson-street-testimony/madras-street-1945.jpg',
    alt: '弗兰克·邦德拍摄的1945年马德拉斯街景。',
  },
  'zh/six-modern-concepts-created-by-christianity': {
    src: '/images/six-modern-concepts-created-by-christianity/2ngkck7y.webp',
    alt: '卡拉瓦乔的《多马的怀疑》，多马俯身查看耶稣肋旁的伤口。',
  },
  'zh/tea-at-four': {
    src: '/images/tea-at-four/tea-cover.webp',
    alt: '插图：午后阳光洒在窗前的茶壶和茶杯上。',
  },
  'en/sam-kamaleson-street-testimony': {
    src: '/images/sam-kamaleson-street-testimony/madras-street-1945.jpg',
    alt: 'A street in Madras photographed by Frank Bond in 1945.',
  },
  'en/tea-at-four': {
    src: '/images/tea-at-four/tea-afternoon.webp',
    alt: 'Illustration of a teapot and cup by a window, with an empty chair.',
  },
};

const sectionCovers = {
  faith: EDITORIAL_COVERS['confidence-behind-rationality-science-atheism-faith-issue'],
  scripture: EDITORIAL_COVERS['if-i-were-paralyzed-a-poems-gospel-reflection'],
  literature: EDITORIAL_COVERS['god-is-dead-chesterton-vs-nietzsche'],
  life: EDITORIAL_COVERS['if-i-were-paralyzed-a-poems-gospel-reflection'],
};

export function listCoverResolver(publicDir: URL, lang: Lang) {
  const metadata = new Map<string, ReturnType<typeof readImage>>();

  async function readImage(src: string) {
    try {
      const { autoOrient: { width, height } } = await sharp(fileURLToPath(new URL(`.${src}`, publicDir))).metadata();
      if (width && height) return { src, width, height };
    } catch {
      // An upload can be removed independently of its article in Pages CMS.
    }
  }

  function image(src: string) {
    if (!metadata.has(src)) metadata.set(src, readImage(src));
    return metadata.get(src)!;
  }

  return async (
    post: { id: string; body?: string; data: { section?: SectionId; coverImage?: string; coverAlt?: string } },
    placement: 'thumbnail' | 'featured',
  ) => {
    const mapped = Object.hasOwn(EDITORIAL_COVERS, post.id) ? EDITORIAL_COVERS[post.id] : undefined;
    const bodyCover = bodyCovers[`${lang}/${post.id}`];
    const fallback = sectionCovers[getSection(post)];
    const choices: ({ src?: string; alt: string; position?: string } | undefined)[] = [
      { src: post.data.coverImage, alt: post.data.coverAlt ?? '' },
      placement === 'thumbnail' && bodyCover && post.body?.includes(bodyCover.src) ? bodyCover : undefined,
      { src: mapped?.src, alt: mapped?.[lang] ?? '' },
      { src: fallback.src, alt: '' },
    ];
    for (const choice of choices) {
      if (!choice?.src) continue;
      const { src, alt, position } = choice;
      const original = await image(src);
      if (!original) continue;
      const small = /-600\.webp$/i.test(src) ? undefined : await image(src.replace(/\.[^.]+$/, '-600.webp'));
      const candidates = small && small.width < original.width && Math.abs(small.width / small.height - original.width / original.height) < .01
        ? [small, original] : [original];
      return { ...original, alt, position, srcset: candidates.length > 1 ? candidates.map(candidate => `${candidate.src} ${candidate.width}w`).join(', ') : undefined };
    }
  };
}
