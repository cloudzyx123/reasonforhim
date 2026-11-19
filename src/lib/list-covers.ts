import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { EDITORIAL_COVERS, getSection, type SectionId } from './editorial';
import type { Lang } from './i18n';

type CoverChoice = { src?: string; alt: string; position?: string; fit?: 'contain' };

// These images were checked in the article and at the list's 4:3 crop. Keep the
// language in the key so each thumbnail comes from that version of the article.
const bodyCovers: Record<string, CoverChoice & { src: string }> = {
  'zh/a-kid-asks-if-my-parents-dont-believe-in-jesus-can-they-go-to-heaven': {
    src: '/images/a-kid-asks-if-my-parents-dont-believe-in-jesus-can-they-go-to-heaven/christ-blessing-the-children.webp',
    alt: '老卢卡斯·克拉纳赫的画作，几位母亲带着孩子来到耶稣面前。',
  },
  'zh/ai-faith-john-lennox': {
    src: '/images/ai-faith-john-lennox/bruegel-tower-of-babel.webp',
    alt: '老彼得·勃鲁盖尔的《巴别塔》，巨塔在港口的城市中层层升起。',
  },
  'zh/augustine-confessions-astrology-confusion-three-modern-versions': {
    src: '/images/augustine-confessions-astrology-confusion-three-modern-versions/ldy2cxny7.webp',
    alt: '达尔文、马克思和弗洛伊德的三幅黑白肖像并排。',
    fit: 'contain',
  },
  'zh/chapter-1-your-kingdom-come': {
    src: '/images/chapter-1-your-kingdom-come/dz8wa4y8n.webp',
    alt: '阳光穿过云层，图中写着“愿你的国降临”。',
  },
  'zh/chapter-3-price-of-the-masses': {
    src: '/images/chapter-3-price-of-the-masses/9nedcm9w6.webp',
    alt: '树梢间的夜空中横亘着一带繁星。',
  },
  'zh/christmas-true-meaning-incarnation-thoughts-through-the-ages': {
    src: '/images/christmas-true-meaning-incarnation-thoughts-through-the-ages/87kpc4g5x.webp',
    alt: '画中人物低垂双眼，脸庞映着金色。',
    position: '100% 50%',
  },
  'zh/confidence-behind-rationality-science-atheism-faith-issue': {
    src: '/images/confidence-behind-rationality-science-atheism-faith-issue/5wz9az4lv.webp',
    alt: '三位嘉宾坐在讲台上交谈。',
  },
  'zh/free-grace': {
    src: '/images/free-grace/tintoretto-conversion-of-saint-paul.webp',
    alt: '丁托列托画笔下的保罗倒在石阶上，举起双手望向天空。',
  },
  'zh/god-is-dead-chesterton-vs-nietzsche': {
    src: '/images/god-is-dead-chesterton-vs-nietzsche/ve02uglv9.webp',
    alt: '插画中，两位穿外套的人并肩走着，其中一人戴着帽子。',
  },
  'zh/how-can-you-say-only-one-true-faith': {
    src: '/images/how-can-you-say-only-one-true-faith/m8mduzdo.webp',
    alt: '红色封面的《Confronting Christianity》置于桌上。',
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
  'zh/lewis-and-tolkien-debate-myths-and-lies': {
    src: '/images/lewis-and-tolkien-debate-myths-and-lies/m8mdu63pm.webp',
    alt: '托尔金和C.S.路易斯的黑白肖像并排。',
    fit: 'contain',
  },
  'zh/neglected-fairy-tale-master-and-removed-easter-eggs': {
    src: '/images/neglected-fairy-tale-master-and-removed-easter-eggs/opn6cyn4e.webp',
    alt: '《公主与哥布林》封面上的山谷与城堡。',
    position: '50% 40%',
  },
  'zh/sam-kamaleson-street-testimony': {
    src: '/images/sam-kamaleson-street-testimony/madras-street-1945.jpg',
    alt: '弗兰克·邦德拍摄的1945年马德拉斯街景。',
  },
  'zh/satirical-poem-modern-people-creed-steve-turner': {
    src: '/images/satirical-poem-modern-people-creed-steve-turner/z40dumldg.webp',
    alt: '并排的三幅黑白人物肖像。',
    fit: 'contain',
  },
  'zh/six-modern-concepts-created-by-christianity': {
    src: '/images/six-modern-concepts-created-by-christianity/2ngkck7y.webp',
    alt: '卡拉瓦乔的《多马的怀疑》，多马俯身查看耶稣肋旁的伤口。',
  },
  'zh/tea-at-four': {
    src: '/images/tea-at-four/tea-cover.webp',
    alt: '插图：午后阳光洒在窗前的茶壶和茶杯上。',
  },
  'zh/three-objections-to-fairy-tales-and-cs-lewiss-response': {
    src: '/images/three-objections-to-fairy-tales-and-cs-lewiss-response/raphael-saint-george-and-the-dragon.webp',
    alt: '拉斐尔画笔下的圣乔治骑着白马迎战巨龙，远处有一位跪着祈祷的人。',
    fit: 'contain',
  },
  'zh/who-can-give-peace-to-betrayers-cannibals-and-murderers': {
    src: '/images/who-can-give-peace-to-betrayers-cannibals-and-murderers/z40dumlr8.webp',
    alt: '黑白照片中，多人聚在一座高顶茅草屋门口。',
  },
  'zh/why-the-bible-descriptions-of-heaven-are-superficial': {
    src: '/images/why-the-bible-descriptions-of-heaven-are-superficial/07ywcdegl.webp',
    alt: '黑底插图把物理方程和“于是有了光”并置。',
    fit: 'contain',
  },
  'zh/yang-xiaokai-3-processes-of-knowing-christianity': {
    src: '/images/yang-xiaokai-3-processes-of-knowing-christianity/07ywclk26.webp',
    alt: '黑白照片中，一位男子站在花丛和树林前。',
  },
  'zh/zi-li-xuan-min-chapter-2': {
    src: '/images/zi-li-xuan-min-chapter-2/4zx4a4lw2.webp',
    alt: '罗伯特·香客的《子里的选民》英文版封面。',
    fit: 'contain',
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
      const file = fileURLToPath(new URL(`.${src}`, publicDir));
      await access(file);
      const { autoOrient: { width, height } } = await sharp(file).metadata();
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
    const choices: (CoverChoice | undefined)[] = [
      { src: post.data.coverImage, alt: post.data.coverAlt ?? '' },
      placement === 'thumbnail' && bodyCover && post.body?.includes(bodyCover.src) ? bodyCover : undefined,
      { src: mapped?.src, alt: mapped?.[lang] ?? '' },
      { src: fallback.src, alt: '' },
    ];
    for (const choice of choices) {
      if (!choice?.src) continue;
      const { src, alt, position, fit } = choice;
      const original = await image(src);
      if (!original) continue;
      const small = /-600\.webp$/i.test(src) ? undefined : await image(src.replace(/\.[^.]+$/, '-600.webp'));
      const candidates = small && small.width < original.width && Math.abs(small.width / small.height - original.width / original.height) < .01
        ? [small, original] : [original];
      return { ...original, alt, position, fit, srcset: candidates.length > 1 ? candidates.map(candidate => `${candidate.src} ${candidate.width}w`).join(', ') : undefined };
    }
  };
}
