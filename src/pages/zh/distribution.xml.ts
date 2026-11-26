import type { APIContext } from 'astro';
import { distributionFeed } from '../../lib/distribution-feed.mjs';
import { readDeploymentCatalog } from '../../lib/syndication.mjs';

export function GET({ site }: APIContext) {
  const catalog = readDeploymentCatalog({ site: site!.href });
  return distributionFeed({ catalog, site: site! });
}
