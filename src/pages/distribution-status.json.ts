import type { APIContext } from 'astro';
import { productionIndex, readDeploymentCatalog } from '../lib/syndication.mjs';

export function GET({ site }: APIContext) {
  const catalog = readDeploymentCatalog({ site: site!.href });
  return Response.json(productionIndex(catalog));
}
