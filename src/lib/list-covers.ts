import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { EDITORIAL_COVERS, getSection, type SectionId } from './editorial';
import type { Lang } from './i18n';

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

  return async (post: { id: string; data: { section?: SectionId; coverImage?: string; coverAlt?: string } }) => {
    const mapped = Object.hasOwn(EDITORIAL_COVERS, post.id) ? EDITORIAL_COVERS[post.id] : undefined;
    const fallback = sectionCovers[getSection(post)];
    const choices = [
      { src: post.data.coverImage, alt: post.data.coverAlt ?? '' },
      { src: mapped?.src, alt: mapped?.[lang] ?? '' },
      { src: fallback.src, alt: '' },
    ];
    for (const { src, alt } of choices) {
      if (!src) continue;
      const original = await image(src);
      if (!original) continue;
      const small = /-600\.webp$/i.test(src) ? undefined : await image(src.replace(/\.[^.]+$/, '-600.webp'));
      const candidates = small && small.width < original.width && Math.abs(small.width / small.height - original.width / original.height) < .01
        ? [small, original] : [original];
      return { ...original, alt, srcset: candidates.length > 1 ? candidates.map(candidate => `${candidate.src} ${candidate.width}w`).join(', ') : undefined };
    }
  };
}
