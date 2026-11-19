import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parse } from 'parse5';
import { DAY_MS, articleOrder, compareArticles, getTopWindow, matchesArticle, selectFeatured, validatePopularitySnapshot } from '../src/lib/article-list.mjs';
import { analyticsWindow, collectPopularity, publishedPaths } from './update-article-popularity.mjs';

const now = Date.parse('2026-11-18T18:00:00Z');
const latest = { id: 'latest', date: 3, views: 0 };
const middle = { id: 'middle', date: 2 };
const popular = { id: 'popular', date: 1, views: 25 };
const tie = { id: 'another', date: 1, views: 25 };

test('New, Oldest and Top use stable dates and article IDs, including missing and zero views', () => {
  const articles = [middle, popular, latest, tie];
  const ids = order => [...articles].sort((a, b) => compareArticles(a, b, order)).map(article => article.id);
  assert.deepEqual(ids('newest'), ['latest', 'middle', 'another', 'popular']);
  assert.deepEqual(ids('oldest'), ['another', 'popular', 'middle', 'latest']);
  assert.deepEqual(ids('top'), ['another', 'popular', 'latest', 'middle']);
  assert.ok(compareArticles({ ...latest, views: 25 }, popular, 'top') < 0);
});

test('section, year, search and exact tags combine inside the Top order', () => {
  const filters = { terms: ['信仰', 'hope'], topic: '福音', section: 'faith', year: '2025' };
  const fields = { section: 'faith', year: '2025', tags: ['福音'], search: '信仰与 hope' };
  const articles = [
    { ...middle, ...fields, year: '2024', views: 55 },
    { ...popular, ...fields },
    { ...tie, ...fields, section: 'life', views: 42 },
    { ...latest, ...fields },
    { ...tie, ...fields, search: '信仰', views: 50 },
    { ...tie, ...fields, tags: ['福音故事'], views: 50 },
  ];
  assert.deepEqual(articles.filter(article => matchesArticle(article, filters)).sort((a, b) => compareArticles(a, b, 'top')).map(article => article.id), ['popular', 'latest']);
});

test('Top requires a fresh, valid snapshot with measured views in the current language', () => {
  const raw = { version: 1, source: 'cloudflare-web-analytics', estimated: true, windowStart: '2026-08-19', windowEnd: '2026-11-17', updatedAt: new Date(now).toISOString(), pageViews: { '/zh/tea/': 2 } };
  const snapshot = validatePopularitySnapshot(raw);
  assert.equal(getTopWindow(snapshot, true, now), 90);
  assert.equal(articleOrder('top', getTopWindow(snapshot, false, now)), 'newest');
  assert.equal(articleOrder('top', getTopWindow(snapshot, true, now + 16 * DAY_MS)), 'newest');
  assert.equal(articleOrder('oldest', 0), 'oldest');
  assert.equal(articleOrder(null, 90), 'newest');
  assert.equal(articleOrder('top', 90), 'top');
  assert.equal(validatePopularitySnapshot({ ...raw, pageViews: { '/zh/tea': 3 } }), null);
  assert.equal(validatePopularitySnapshot({ ...raw, pageViews: { '/zh/tea/': -3 } }), null);
  assert.equal(validatePopularitySnapshot({ ...raw, windowEnd: '2026-11-31' }), null);
});

test('editorial selections prioritize explicit public IDs and fill remaining slots in date order', () => {
  const posts = ['latest', 'second', 'third', 'fourth', 'draft'].map(id => ({ id, data: { draft: id === 'draft' } }));
  assert.deepEqual(selectFeatured(posts, ['draft', 'fourth', 'missing', 'fourth']).map(post => post.id), ['fourth', 'latest', 'second']);
  assert.deepEqual(selectFeatured(posts, []).map(post => post.id), ['latest', 'second', 'third']);
});

const limits = { enabled: true, maxDuration: 30 * DAY_MS / 1000, notOlderThan: 180 * DAY_MS / 1000, maxPageSize: 3 };

test('Cloudflare retention caps the visible window and chunks cover it without overlap', () => {
  const period = analyticsWindow(limits, now);
  assert.deepEqual(period.windows, [
    { start: '2026-08-19', end: '2026-09-18' },
    { start: '2026-09-18', end: '2026-10-18' },
    { start: '2026-10-18', end: '2026-11-17' },
  ]);
  assert.equal(analyticsWindow({ ...limits, notOlderThan: 30 * DAY_MS / 1000 }, now).windowStart, '2026-10-20');
  assert.throws(() => analyticsWindow({ ...limits, enabled: false }, now), /unavailable/);
});

test('only current published paths are queried and slash aliases aggregate without merging languages', async t => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'reasonforhim-content-'));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  for (const lang of ['zh', 'en']) {
    const dir = path.join(workspace, 'src/content', lang);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'tea.md'), '---\nurlName: tea\ndraft: false\n---\n');
    await writeFile(path.join(dir, 'unpublished.md'), '---\nurlName: unpublished\ndraft: true\n---\n');
  }
  const paths = await publishedPaths(workspace);
  assert.deepEqual(paths, ['/en/tea/', '/zh/tea/']);
  let calls = 0;
  const graphQL = async query => {
    if (query.includes('PageLoadSettings')) return [{ settings: { rumPageloadEventsAdaptiveGroups: limits } }];
    calls++;
    assert.match(query, /requestHost: "reasonforhim\.com"/);
    const batch = JSON.parse(query.match(/requestPath_in: (\[[^\]]+\])/)[1]);
    const limit = Number(query.match(/limit: (\d+)/)[1]);
    assert.equal(batch.length, limit);
    assert.ok(batch.every(path => /^\/(zh|en)\/tea\/?$/.test(path)));
    const rows = batch.map(requestPath => ({ count: requestPath === '/en/tea/' ? 5 : 1, dimensions: { requestPath } }));
    return [{ rumPageloadEventsAdaptiveGroups: rows }];
  };
  const snapshot = await collectPopularity({ graphQL, account: 'example', paths, now });
  assert.equal(calls, 6);
  assert.deepEqual(snapshot.pageViews, { '/en/tea/': 18, '/zh/tea/': 6 });
});

test('empty, zero-only, or failed Cloudflare responses cannot supply a replacement snapshot', async () => {
  const collect = read => collectPopularity({
    graphQL: async (query) => query.includes('PageLoadSettings')
      ? [{ settings: { rumPageloadEventsAdaptiveGroups: limits } }] : [{ rumPageloadEventsAdaptiveGroups: await read() }],
    account: 'example', paths: ['/zh/tea/'], now,
  });
  await assert.rejects(collect(() => []), /no measured/);
  await assert.rejects(collect(() => [{ count: 0, dimensions: { requestPath: '/zh/tea/' } }]), /no measured/);
  let requests = 0;
  await assert.rejects(collect(() => {
    if (++requests === 2) throw new Error('API interrupted');
    return [{ count: 5, dimensions: { requestPath: '/zh/tea/' } }];
  }), /API interrupted/);
});

function nodes(node, predicate) {
  return [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => nodes(child, predicate))];
}

function attr(node, name) {
  return node.attrs?.find(attribute => attribute.name === name)?.value;
}

test('both languages ship a date-sorted catalogue, working thumbnails, and clean canonical URLs', async () => {
  const paths = await publishedPaths();
  for (const lang of ['zh', 'en']) {
    for (const suffix of ['', 'archive/']) {
      const url = `/${lang}/${suffix}`;
      const document = parse(await readFile(`dist${url}index.html`, 'utf8'));
      const rows = nodes(document, node => attr(node, 'data-post') !== undefined);
      const ids = rows.map(row => ({ id: attr(row, 'data-post'), date: Date.parse(attr(row, 'data-date')) }));
      assert.deepEqual(ids, [...ids].sort(compareArticles));
      const links = rows.map(row => attr(nodes(row, node => node.tagName === 'a')[0], 'href'));
      assert.deepEqual([...links].sort(), paths.filter(article => article.startsWith(`/${lang}/`)));
      assert.equal(attr(nodes(document, node => attr(node, 'rel') === 'canonical')[0], 'href'), `https://reasonforhim.com${url}`);
      assert.notEqual(attr(nodes(document, node => node.tagName === 'option' && attr(node, 'value') === 'top')[0], 'disabled'), undefined);
      for (const row of rows) {
        const [img] = nodes(row, node => node.tagName === 'img');
        assert.equal(attr(img, 'loading'), 'lazy');
        assert.notEqual(attr(img, 'alt'), undefined);
        assert.ok(Number(attr(img, 'width')) > 0 && Number(attr(img, 'height')) > 0);
        await access(`dist${attr(img, 'src')}`);
        for (const candidate of (attr(img, 'srcset') ?? '').split(', ').filter(Boolean)) await access(`dist${candidate.split(' ')[0]}`);
      }
    }
  }
});
