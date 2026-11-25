import type { APIContext } from 'astro';
import { distributionFeed } from '../../lib/distribution-feed.mjs';
import { readCatalog } from '../../lib/syndication.mjs';

export function GET({ site }: APIContext) {
  const cloudflare = process.env.CF_PAGES === '1';
  const catalog = cloudflare && process.env.CF_PAGES_BRANCH !== 'main'
    ? { baseline: null, articles: [] }
    : readCatalog({ site: site!.href, fetchHistory: cloudflare, includeUnconfigured: false });
  return distributionFeed({ catalog, site: site! });
}
