import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { listCoverResolver } from '../src/lib/list-covers.ts';
import { FEATURED_ARTICLES } from '../src/lib/editorial.ts';
import { parse } from 'parse5';
import { DAY_MS, articleOrder, compareArticles, getTopWindow, matchesArticle, selectHomeReading, validatePopularitySnapshot } from '../src/lib/article-list.mjs';
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

test('section, year and exact tags combine inside the Top order', () => {
  const filters = { topic: '福音', section: 'faith', year: '2025' };
  const fields = { section: 'faith', year: '2025', tags: ['福音'] };
  const articles = [
    { ...middle, ...fields, year: '2024', views: 55 },
    { ...popular, ...fields },
    { ...tie, ...fields, section: 'life', views: 42 },
    { ...latest, ...fields },
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

test('a single configured public cover precedes up to five other recent essays', () => {
  for (const size of [0, 1, 2, 3, 8]) {
    const posts = Array.from({ length: size }, (_, i) => ({ id: String(i), data: {} }));
    const draft = { id: 'draft', data: { draft: true } };
    for (const ids of [[], ['draft', 'missing'], ['draft', '4', '4', '1']]) {
      const { cover, recent } = selectHomeReading([draft, ...posts], ids);
      const expected = ids.map(id => posts.find(post => post.id === id)).find(Boolean) ?? posts[0];
      assert.equal(cover, expected);
      assert.deepEqual(recent, posts.filter(post => post !== expected).slice(0, 5));
    }
  }
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

test('article artwork requires an existing original and body picks require a matching reference', async () => {
  const resolve = listCoverResolver(new URL('../public/', import.meta.url), 'en');
  const body = '/images/tea-at-four/tea-afternoon.webp';
  const tea = { id: 'tea-at-four', body, data: { coverImage: '/images/missing.webp' } };
  for (const placement of ['home', 'archive']) {
    assert.equal((await resolve(tea, placement)).src, body);
    assert.equal((await resolve({ ...tea, data: { coverImage: '/images/editorial/reason.webp' } }, placement)).src, body);
    assert.equal((await resolve({ ...tea, body: '' }, placement)).src, '/images/tea-at-four/tea-cover.webp');
    const cms = { coverImage: '/images/sam-kamaleson-street-testimony/madras-street-1945.jpg', coverAlt: 'A street in Madras.' };
    const cover = await resolve({ ...tea, data: cms }, placement);
    assert.equal(cover.src, cms.coverImage);
    assert.equal(cover.alt, cms.coverAlt);
  }
  for (const coverImage of ['/images/missing.webp', '/images/editorial/dialogue.webp', '/images/editorial/grace-600.webp']) {
    const post = { id: 'unknown', data: { section: 'life', coverImage } };
    assert.equal(await resolve(post, 'home'), undefined);
    assert.ok((await resolve(post, 'archive')).src.startsWith('/images/editorial/'));
  }
  assert.equal(await resolve({ id: 'god-is-dead-chesterton-vs-nietzsche', data: {} }, 'home'), undefined);
});

test('each home has a single cover, distinct recent essays and native catalogue destinations', async () => {
  for (const lang of ['zh', 'en']) {
    const home = parse(await readFile(`dist/${lang}/index.html`, 'utf8'));
    const archive = parse(await readFile(`dist/${lang}/archive/index.html`, 'utf8'));
    const rows = doc => nodes(doc, node => attr(node, 'data-post') !== undefined);
    const posts = rows(archive).map(row => ({ id: attr(row, 'data-post'), data: {} }));
    const { cover, recent } = selectHomeReading(posts, FEATURED_ARTICLES[lang]);
    assert.equal(nodes(home, node => node.tagName === 'h1').length, 1);
    assert.equal(nodes(home, node => attr(node, 'data-archive') !== undefined).length, 0);
    assert.equal(attr(nodes(home, node => attr(node, 'rel') === 'canonical')[0], 'href'), `https://reasonforhim.com/${lang}/`);
    assert.equal(attr(nodes(home, node => node.tagName === 'form')[0], 'action'), `/${lang}/archive/#articles`);
    for (const id of ['about', 'articles']) assert.equal(nodes(home, node => attr(node, 'id') === id).length, 1);
    for (const section of ['faith', 'scripture', 'literature', 'life']) {
      assert.ok(nodes(home, node => attr(node, 'href') === `/${lang}/archive/?section=${section}#articles`).length);
    }
    assert.deepEqual(rows(home).map(row => attr(row, 'data-post')), recent.map(post => post.id));
    const lead = nodes(home, node => attr(node, 'aria-labelledby') === 'cover-title');
    assert.equal(lead.length, cover ? 1 : 0);
    if (!cover) continue;
    assert.equal(attr(lead[0], 'href'), `/${lang}/${cover.id}/`);
    const [img] = nodes(lead[0], node => node.tagName === 'img');
    const archiveRow = rows(archive).find(row => attr(row, 'data-post') === cover.id);
    const [thumbnail] = nodes(archiveRow, node => node.tagName === 'img');
    const original = src => src.replace(/^\/(?:_thumbs|images)\//, '').replace(/-\d+\.webp$/, '');
    const archiveArt = thumbnail && original(attr(thumbnail, 'src'));
    if (archiveArt && !/^editorial\/(grace|dialogue|reason)(-600)?\.webp$/.test(archiveArt)) assert.ok(img);
    if (img) {
      assert.equal(original(attr(img, 'src')), archiveArt);
      assert.equal(attr(img, 'loading'), 'eager');
      assert.equal(attr(img, 'fetchpriority'), 'high');
      for (const candidate of attr(img, 'srcset').split(', ')) await access(`dist${candidate.split(' ')[0]}`);
    }
  }
});

test('both languages ship a date-sorted catalogue, working thumbnails, and clean canonical URLs', async () => {
  const paths = await publishedPaths();
  for (const lang of ['zh', 'en']) {
    const url = `/${lang}/archive/`;
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
});

test('reviewed body images take priority in the archive, with language-specific picks', async () => {
  const expected = {
    zh: {
      'a-kid-asks-if-my-parents-dont-believe-in-jesus-can-they-go-to-heaven': 'christ-blessing-the-children.webp',
      'ai-faith-john-lennox': 'bruegel-tower-of-babel.webp',
      'augustine-confessions-astrology-confusion-three-modern-versions': 'ldy2cxny7.webp',
      'free-grace': 'tintoretto-conversion-of-saint-paul.webp',
      'if-i-were-paralyzed-a-poems-gospel-reflection': 'ewl5awlno.webp',
      'israeli-stamps-isaiah-hope': 'israel-stamps-1962-full-tabs.jpg',
      'laurence-a-martyr-died-from-telling-jokes': '65w8ck3r8.webp',
      'sam-kamaleson-street-testimony': 'madras-street-1945.jpg',
      'six-modern-concepts-created-by-christianity': '2ngkck7y.webp',
      'tea-at-four': 'tea-cover.webp',
      'three-objections-to-fairy-tales-and-cs-lewiss-response': 'raphael-saint-george-and-the-dragon.webp',
    },
    en: {
      'sam-kamaleson-street-testimony': 'madras-street-1945.jpg',
      'tea-at-four': 'tea-afternoon.webp',
    },
  };
  for (const [lang, covers] of Object.entries(expected)) {
    const document = parse(await readFile(`dist/${lang}/archive/index.html`, 'utf8'));
    for (const [id, file] of Object.entries(covers)) {
      const [row] = nodes(document, node => attr(node, 'data-post') === id);
      const [img] = nodes(row, node => node.tagName === 'img');
      assert.ok(attr(img, 'src').endsWith(`/${id}/${file}-160.webp`), `${lang}/${id} uses its own article image`);
      assert.ok(attr(img, 'alt').trim());
    }
    if (lang === 'zh') {
      const [row] = nodes(document, node => attr(node, 'data-post') === 'a-painful-letter-of-recovery-rethinking-church-liberalization-and-lgbt-movement');
      const [img] = nodes(row, node => node.tagName === 'img');
      assert.equal(attr(img, 'src'), '/_thumbs/editorial/grace.webp-160.webp');
    }
  }
});
