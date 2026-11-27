import type { APIContext } from 'astro';
import { distributionFeed } from '../../lib/distribution-feed.mjs';
import { readDeploymentCatalog } from '../../lib/syndication.mjs';

// 《卢梭》上、下篇由 Brevo 单次活动补发，避免 RSS 再次通知。
const manuallyMailed = new Set([
  'e1210bd3d69c3487732b877a14948007',
  'f02ef7bfd9d9978a8fd2799ad21cb4b6',
]);

export function GET({ site }: APIContext) {
  const catalog = readDeploymentCatalog({ site: site!.href });
  const articles = catalog.articles.filter(article => !manuallyMailed.has(article.stableId));
  return distributionFeed({ catalog: { ...catalog, articles }, site: site! });
}
