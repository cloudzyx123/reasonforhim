import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DAY_MS, POPULARITY_SOURCE, normalizeArticlePath, validatePopularitySnapshot } from '../src/lib/article-list.mjs';
import { validateArticle } from './check-pages-cms.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const host = 'reasonforhim.com';
const date = time => new Date(time).toISOString().slice(0, 10);
const settingsQuery = ({ account }) => `query PageLoadSettings {
  viewer { accounts(filter: { accountTag: ${JSON.stringify(account)} }) {
    settings { rumPageloadEventsAdaptiveGroups { enabled maxDuration notOlderThan maxPageSize } }
  } }
}`;
const pageQuery = ({ account, host, paths, start, end, limit }) => `query ArticlePageViews {
  viewer { accounts(filter: { accountTag: ${JSON.stringify(account)} }) {
    rumPageloadEventsAdaptiveGroups(
      filter: { requestHost: ${JSON.stringify(host)}, requestPath_in: ${JSON.stringify(paths)}, date_geq: ${JSON.stringify(start)}, date_lt: ${JSON.stringify(end)} }
      limit: ${limit}
      orderBy: [count_DESC]
    ) { count dimensions { requestPath } }
  } }
}`;

export async function publishedPaths(workspace = root) {
  const paths = [];
  for (const lang of ['zh', 'en']) {
    const dir = path.join(workspace, 'src/content', lang);
    for (const file of (await fs.readdir(dir)).filter(file => /\.mdx?$/.test(file))) {
      const { data } = validateArticle(file, await fs.readFile(path.join(dir, file), 'utf8'));
      if (!data.draft) paths.push(`/${lang}/${data.urlName}/`);
    }
  }
  return [...new Set(paths)].sort();
}

export function analyticsWindow(limits, now) {
  const secondsPerDay = DAY_MS / 1000;
  const end = Math.floor(now / DAY_MS) * DAY_MS - DAY_MS;
  const retained = Math.floor((limits.notOlderThan * 1000 - (now - end)) / DAY_MS);
  const days = Math.min(90, retained);
  const chunkDays = Math.floor(limits.maxDuration / secondsPerDay);
  if (!limits.enabled || !(days > 0) || !(chunkDays > 0) || !Number.isSafeInteger(limits.maxPageSize) || limits.maxPageSize < 2) {
    throw new Error('Cloudflare RUM is unavailable or its query limits are insufficient.');
  }
  const start = end - days * DAY_MS;
  const windows = [];
  for (let from = start; from < end; from += chunkDays * DAY_MS) {
    windows.push({ start: date(from), end: date(Math.min(end, from + chunkDays * DAY_MS)) });
  }
  return { windowStart: date(start), windowEnd: date(end), windows };
}

export async function collectPopularity({ graphQL, account, paths, now = Date.now() }) {
  const [{ settings: { rumPageloadEventsAdaptiveGroups: limits } }] = await graphQL(settingsQuery({ account }));
  const { windowStart, windowEnd, windows } = analyticsWindow(limits, now);
  const aliases = paths.flatMap(value => [value, value.slice(0, -1)]);
  const batchSize = Math.min(limits.maxPageSize, 50);
  const allowed = new Set(paths);
  const totals = new Map();
  for (const window of windows) {
    for (let offset = 0; offset < aliases.length; offset += batchSize) {
      const batch = aliases.slice(offset, offset + batchSize);
      const [{ rumPageloadEventsAdaptiveGroups: rows }] = await graphQL(pageQuery({
        account, host, paths: batch, ...window, limit: batch.length,
      }));
      if (!Array.isArray(rows) || rows.length > batch.length) throw new Error('Invalid Cloudflare page-load response.');
      const seen = new Set();
      for (const { count, dimensions } of rows) {
        const raw = dimensions?.requestPath;
        const normalized = normalizeArticlePath(raw);
        if (!allowed.has(normalized)) continue;
        if (!batch.includes(raw) || seen.has(raw) || !Number.isSafeInteger(count) || count < 0) {
          throw new Error('Invalid Cloudflare page-load group.');
        }
        seen.add(raw);
        totals.set(normalized, (totals.get(normalized) ?? 0) + count);
      }
    }
  }
  if (![...totals.values()].some(count => count > 0)) throw new Error('Cloudflare returned no measured article page views.');
  const snapshot = validatePopularitySnapshot({
    version: 1, source: POPULARITY_SOURCE, estimated: true, windowStart, windowEnd,
    updatedAt: new Date(now).toISOString(), pageViews: Object.fromEntries([...totals].sort()),
  });
  if (!snapshot) throw new Error('Invalid popularity snapshot.');
  return snapshot;
}

async function update() {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_ANALYTICS_TOKEN;
  if (!account || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_ANALYTICS_TOKEN.');
  async function graphQL(query) {
    const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`Cloudflare GraphQL HTTP ${response.status}.`);
    const { data, errors } = await response.json();
    const accounts = data?.viewer?.accounts;
    if (errors?.length) throw new Error(`Cloudflare GraphQL: ${errors.map(error => error.message).join('; ')}`);
    if (accounts?.length !== 1) throw new Error('Cloudflare GraphQL did not return the configured account.');
    return accounts;
  }

  const snapshot = await collectPopularity({ graphQL, account, paths: await publishedPaths() });
  console.log(`Cloudflare RUM ${snapshot.windowStart}–${snapshot.windowEnd} UTC, ${Object.keys(snapshot.pageViews).length} published article paths.`);
  if (process.argv.includes('--check')) return;
  const dest = path.join(root, 'output/popularity-site/article-popularity.json');
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(`${dest}.tmp`, `${JSON.stringify(snapshot, null, 2)}\n`);
  await fs.rename(`${dest}.tmp`, dest);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  update().catch(error => { console.error(error.message); process.exitCode = 1; });
}
