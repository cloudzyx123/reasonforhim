export const DAY_MS = 86_400_000;
export const POPULARITY_SOURCE = 'cloudflare-web-analytics';
const MAX_SNAPSHOT_AGE = 16 * DAY_MS;
const articlePattern = /^\/(?:zh|en)\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/;

export function normalizeArticlePath(path) {
  if (typeof path !== 'string' || !articlePattern.test(path)) return null;
  return path.endsWith('/') ? path : `${path}/`;
}

export function validatePopularitySnapshot(snapshot) {
  if (snapshot?.source !== POPULARITY_SOURCE || snapshot?.version !== 1 || snapshot.estimated !== true) return null;
  const { windowStart, windowEnd, updatedAt, pageViews } = snapshot;
  if (![windowStart, windowEnd].every(date => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().startsWith(date))) return null;
  const start = Date.parse(windowStart);
  const end = Date.parse(windowEnd);
  const updated = Date.parse(updatedAt);
  if (!(end > start && end - start <= 90 * DAY_MS && updated >= end && updated - end <= 3 * DAY_MS)) return null;
  if (!pageViews || typeof pageViews !== 'object' || Array.isArray(pageViews)) return null;
  if (!Object.entries(pageViews).every(([path, count]) => normalizeArticlePath(path) === path && Number.isSafeInteger(count) && count >= 0)) return null;
  return { version: 1, source: POPULARITY_SOURCE, estimated: true, windowStart, windowEnd, updatedAt, pageViews };
}

export function getTopWindow(snapshot, hasViews, now = Date.now()) {
  if (!hasViews || !snapshot) return 0;
  const end = Date.parse(snapshot.windowEnd);
  return Date.parse(snapshot.updatedAt) <= now && now - end < MAX_SNAPSHOT_AGE ? (end - Date.parse(snapshot.windowStart)) / DAY_MS : 0;
}

export function articleOrder(value, topWindow) {
  if (value === 'oldest' || (value === 'top' && topWindow > 0)) return value;
  return 'newest';
}

export function compareArticles(a, b, order = 'newest') {
  const newestFirst = b.date - a.date;
  const idOrder = a.id < b.id ? -1 : Number(a.id > b.id);
  if (order === 'oldest') return -newestFirst || idOrder;
  if (order === 'top') return (b.views ?? 0) - (a.views ?? 0) || newestFirst || idOrder;
  return newestFirst || idOrder;
}

export function matchesArticle(article, { topic, section, year }) {
  return (!topic || article.tags.includes(topic))
    && (!section || article.section === section)
    && (!year || article.year === year);
}

/**
 * @template {{ id: string, data: { draft?: boolean } }} T
 * @param {T[]} posts Essays from one language, newest first.
 * @param {readonly string[]} featuredIds
 */
export function selectHomeReading(posts, featuredIds) {
  const published = posts.filter(post => !post.data.draft);
  const byId = new Map(published.map(post => [post.id, post]));
  const selectedId = featuredIds.find(id => byId.has(id));
  const cover = selectedId ? byId.get(selectedId) : published[0];
  const recent = published.filter(post => post !== cover).slice(0, 5);
  return { cover, recent };
}
