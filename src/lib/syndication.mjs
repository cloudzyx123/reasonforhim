import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSON_SCHEMA, load } from 'js-yaml';
import { canonicalUrl } from './share.mjs';

export const SITE = 'https://reasonforhim.com';
export const productionIndexPath = '/distribution-status.json';
const CONTENT_FILE = /^src\/content\/(zh|en)\/([a-z0-9]+(?:-[a-z0-9]+)*)\.mdx?$/;
const CONTENT_DIRS = ['src/content/zh', 'src/content/en'];
const SHA = /^[a-f0-9]{40}$/;
const DAY = 86_400_000;

export function git(args, cwd = process.cwd(), input) {
  return execFileSync('git', args, {
    cwd, input, encoding: 'utf8', stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  }).trimEnd();
}

export function articleFromPath(file) {
  const match = CONTENT_FILE.exec(file);
  return match ? { lang: match[1], id: match[2] } : null;
}

export function parseFrontmatter(source, file) {
  const front = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const data = front && load(front[1], { schema: JSON_SCHEMA });
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`文章 frontmatter 无法读取：${file}`);
  }
  return data;
}

function articleAt(cwd, sha, file, site) {
  const { lang, id } = articleFromPath(file);
  const revision = git(['rev-parse', `${sha}:${file}`], cwd);
  const data = parseFrontmatter(git(['cat-file', 'blob', revision], cwd), file);
  const pubDate = Date.parse(data.pubDate);
  if (typeof data.title !== 'string' || typeof data.description !== 'string'
    || typeof data.pubDate !== 'string' || !Number.isFinite(pubDate)
    || (data.draft !== undefined && typeof data.draft !== 'boolean')
    || (data.syndicate !== undefined && typeof data.syndicate !== 'boolean')) {
    throw new Error(`文章分发元数据无效：${file}`);
  }
  return {
    lang, id, file, revision, pubDate, draft: data.draft === true, excluded: data.syndicate === false,
    title: data.title.trim(), description: data.description.trim(), tags: data.tags ?? [],
    coverImage: data.coverImage, url: canonicalUrl(site, `/${lang}/${id}/`),
  };
}

function articleId(commit, file) {
  return createHash('sha256').update(`${commit}:${file}`).digest('hex').slice(0, 32);
}

function changesBetween(cwd, before, after) {
  const fields = git(['diff', '--name-status', '-z', '-M', before, after, '--', ...CONTENT_DIRS], cwd).split('\0');
  const changes = [];
  for (let i = 0; fields[i]; ) {
    const status = fields[i++][0];
    const from = fields[i++];
    const to = status === 'R' ? fields[i++] : from;
    if (status === 'R' && articleFromPath(from) && articleFromPath(to)) {
      changes.push({ status, from, to });
      continue;
    }
    if (status === 'R' && articleFromPath(from)) changes.push({ status: 'D', from, to: from });
    if (articleFromPath(to)) changes.push({ status: status === 'R' ? 'A' : status, from: to, to });
  }
  return changes;
}

function publication(article, firstPublicAt, baselineDay) {
  return {
    eligible: !article.excluded && article.pubDate >= baselineDay,
    at: Math.max(firstPublicAt, article.pubDate),
  };
}

export function readDeploymentCatalog({ site, cwd, env = process.env } = {}) {
  const workers = env.WORKERS_CI === '1';
  const pages = env.CF_PAGES === '1';
  const branch = workers ? env.WORKERS_CI_BRANCH : env.CF_PAGES_BRANCH;
  if ((workers || pages) && branch !== 'main') return { baseline: null, articles: [] };
  return readCatalog({ site, cwd, fetchHistory: workers || pages, includeUnconfigured: false });
}

export function readCatalog({ cwd = process.cwd(), head = 'HEAD', site = SITE, fetchHistory = false, includeUnconfigured = true } = {}) {
  const config = JSON.parse(readFileSync(join(cwd, 'syndication.config.json'), 'utf8'));
  const { baseline, renames } = config;
  if (baseline !== null && !SHA.test(baseline)) throw new Error('syndication.config.json 需要完整的基线提交 SHA');
  if (!renames || Object.entries(renames).some(([to, from]) => !articleFromPath(to) || !articleFromPath(from) || from === to)) {
    throw new Error('syndication.config.json 的 renames 需要完整的新旧文章路径');
  }
  if (!baseline && !includeUnconfigured) return { baseline, articles: [] };

  const tip = git(['rev-parse', head], cwd);
  if (baseline && fetchHistory && git(['rev-parse', '--is-shallow-repository'], cwd) === 'true') {
    git(['fetch', '--unshallow', '--no-tags', 'origin'], cwd);
  }
  const anchor = baseline ?? tip;
  const history = baseline ? git(['log', '--first-parent', '--format=%H %ct', tip], cwd).split('\n') : [];
  const anchorIndex = history.findIndex(line => line.startsWith(`${anchor} `));
  if (baseline && anchorIndex === -1) throw new Error('分发基线不在当前分支的第一父历史中，请检查浅克隆或历史重写');
  const baselineDay = baseline ? Math.floor(Number(history[anchorIndex].split(' ')[1]) * 1000 / DAY) * DAY : 0;
  const active = new Map();
  const retired = new Map();
  const files = git(['ls-tree', '-rz', '--name-only', anchor, '--', ...CONTENT_DIRS], cwd).split('\0');
  for (const file of files.filter(articleFromPath)) {
    const article = articleAt(cwd, anchor, file, site);
    active.set(file, { ...article, stableId: articleId(anchor, file), release: article.draft ? null : { eligible: false } });
  }

  let previous = anchor;
  for (const entry of history.slice(0, anchorIndex).reverse()) {
    const [sha, timestamp] = entry.split(' ');
    const changes = changesBetween(cwd, previous, sha);
    previous = sha;
    for (const { status, from } of changes) {
      if (status !== 'D' && status !== 'R') continue;
      if (active.has(from)) retired.set(from, active.get(from));
      active.delete(from);
    }

    const unresolvedRemoval = changes.some(({ status, from }) =>
      status === 'D' && !Object.values(renames).includes(from));
    for (const { status, from, to } of changes) {
      if (status === 'D') continue;
      const previousArticle = status === 'R' ? retired.get(from)
        : active.get(to) ?? retired.get(renames[to]) ?? retired.get(to);
      // Full rewrites can fall below Git's rename detection threshold.
      const identityUncertain = previousArticle?.identityUncertain
        || (status === 'A' && !previousArticle && unresolvedRemoval);
      const article = articleAt(cwd, sha, to, site);
      const release = previousArticle?.release ?? (article.draft ? null : publication(article, Number(timestamp) * 1000, baselineDay));
      active.set(to, { ...article, stableId: previousArticle?.stableId ?? articleId(sha, to), release, identityUncertain });
    }
  }

  const articles = [...active.values()];
  if (new Set(articles.map(article => article.stableId)).size !== articles.length
    || new Set(articles.map(article => article.url)).size !== articles.length) {
    throw new Error('文章身份或路由重复，请检查文章重命名和 syndication.config.json');
  }
  return { baseline, articles };
}

export function isPublic(article, now) {
  return !article.draft && article.pubDate <= now;
}

export function eligibleArticles(catalog, now) {
  return catalog.articles.filter(article => isPublic(article, now) && !article.excluded && !article.identityUncertain
    && article.release?.eligible && article.release.at <= now)
    .sort((a, b) => a.release.at - b.release.at || a.stableId.localeCompare(b.stableId));
}

export function productionIndex({ baseline, articles }) {
  const revisions = Object.fromEntries((baseline ? articles : []).filter(article => !article.draft && !article.identityUncertain)
    .map(({ stableId, revision, url }) => [stableId, { revision, url }]));
  return { baseline, revisions };
}
