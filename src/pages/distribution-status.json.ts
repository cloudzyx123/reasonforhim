import type { APIContext } from 'astro';
import { productionIndex, readCatalog } from '../lib/syndication.mjs';

export function GET({ site }: APIContext) {
  if (process.env.CF_PAGES === '1' && process.env.CF_PAGES_BRANCH !== 'main') {
    return Response.json({ baseline: null, revisions: {} });
  }
  const catalog = readCatalog({ site: site!.href, fetchHistory: process.env.CF_PAGES === '1', includeUnconfigured: false });
  return Response.json(productionIndex(catalog));
}
