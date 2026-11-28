import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { distributionFeed } from '../src/lib/distribution-feed.mjs';
import { eligibleArticles, git, productionIndex, readCatalog, readDeploymentCatalog, SITE } from '../src/lib/syndication.mjs';
import { buildCreatePostInput, createBufferClient } from './buffer-client.mjs';
import { canonicalFromHtml, composePost, hashtagsFrom, readConfig, run, truncateToWeight, xWeightedLength } from './distribute-social.mjs';
import { openLedger } from './social-ledger.mjs';

const NOW = Date.parse('2026-11-24T12:00:00Z');
const THREE_HOURS = 3 * 3600_000;
const BASELINE = 'a'.repeat(40);
const X = { id: 'x-1', service: 'twitter', displayName: 'Test X' };
const FACEBOOK = { id: 'facebook-1', service: 'facebook', displayName: 'Test Facebook' };
const config = overrides => readConfig({
  ACTION: 'auto', BUFFER_API_KEY: 'fake-key', BUFFER_ORGANIZATION_ID: 'org-1',
  BUFFER_CHANNEL_IDS: X.id, SOCIAL_DISTRIBUTION_ENABLED: 'true', ...overrides,
});
const article = (id, lang = 'zh') => ({
  stableId: id.toString(16).padStart(32, '0'), id: `article-${id}`, lang, draft: false, pubDate: NOW - 1000,
  release: { eligible: true, at: NOW - 1000 + id },
  revision: id.toString(16), url: `${SITE}/${lang}/article-${id}/`,
  title: '为何恩典是白白的', description: '一句话摘要。', tags: ['恩典'],
});

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'syndication-test-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const repoGit = (args, input) => git(args, cwd, input);
  repoGit(['init', '-q']);
  repoGit(['config', 'user.email', 'syndication@example.com']);
  repoGit(['config', 'user.name', 'Syndication tests']);
  repoGit(['config', 'core.autocrlf', 'false']);
  const write = (file, text) => {
    mkdirSync(dirname(join(cwd, file)), { recursive: true });
    writeFileSync(join(cwd, file), text);
  };
  let counter = 0;
  const commit = (date = '2026-11-03T12:00:00Z') => {
    repoGit(['add', '--all']);
    // Keep author and committer times deterministic without changing process-wide environment.
    const tree = repoGit(['write-tree']);
    const previous = counter ? ['-p', repoGit(['rev-parse', 'HEAD'])] : [];
    const sha = repoGit(['-c', 'user.name=Syndication tests', 'commit-tree', tree, ...previous, '-m', `Change ${counter++}`]);
    // git log uses the committer date. Amend the commit object before moving the fixture ref.
    const raw = repoGit(['cat-file', '-p', sha]);
    const stamped = raw.replace(/^(author|committer)(.*) \d+ [+-]\d{4}$/gm,
      `$1$2 ${Date.parse(date) / 1000} +0000`);
    const dated = repoGit(['hash-object', '-w', '-t', 'commit', '--stdin'], stamped + '\n');
    repoGit(['update-ref', 'HEAD', dated]);
    return dated;
  };
  const setConfig = (baseline, renames = {}) => write('syndication.config.json', JSON.stringify({ baseline, renames }));
  return { cwd, write, commit, setConfig, repoGit };
}

const file = id => `src/content/zh/${id}.md`;
const body = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} with enough unchanged content.`).join('\n\n');
function doc(id, { draft = false, date = '2026-11-02', fields = '', content = body } = {}) {
  return `---\nurlName: ${id}\ntitle: 中文文章\ndescription: '中文摘要 & <原文>'\npubDate: ${date}\ndraft: ${draft}\n${fields}---\n\n${content}\n`;
}

test('real main history captures drafts and direct publication, excludes migrations and preserves identity across edits and renames', async t => {
  const repo = repository(t);
  repo.setConfig(null);
  repo.write(file('old'), doc('old', { date: '2024-06-01' }));
  repo.write(file('draft'), doc('draft', { draft: true }));
  const baseline = repo.commit('2026-11-01T12:00:00Z');
  repo.setConfig(baseline);
  repo.write(file('draft'), doc('draft', { draft: true, content: 'Edited while a draft' }));
  repo.write(file('old'), doc('old', { fields: 'updatedDate: 2026-11-02\n', date: '2024-06-01' }));
  repo.write(file('migrated'), doc('migrated', { date: '2025-11-03' }));
  repo.write(file('migrated-with-recent-date'), doc('migrated-with-recent-date', { fields: 'syndicate: false\n' }));
  repo.write(file('private'), doc('private', { draft: true }));
  repo.write(file('future'), doc('future', { date: '2026-12-01' }));
  repo.commit('2026-11-02T12:00:00Z');
  assert.deepEqual(eligibleArticles(readCatalog(repo), NOW), []);

  repo.write(file('draft'), doc('draft'));
  repo.write(file('direct'), doc('direct', { fields: 'coverImage: /images/cover.webp\n' }));
  repo.write('public/images/cover.webp', 'cover image bytes');
  repo.commit('2026-11-03T12:00:00Z');
  const before = eligibleArticles(readCatalog(repo), NOW);
  assert.deepEqual(new Set(before.map(item => item.id)), new Set(['draft', 'direct']));
  const direct = before.find(item => item.id === 'direct');

  renameSync(join(repo.cwd, file('direct')), join(repo.cwd, file('new-route')));
  repo.write(file('new-route'), doc('new-route', { date: '2026-11-04', fields: 'coverImage: /images/cover.webp\n' }));
  repo.commit('2026-11-04T12:00:00Z');
  repo.write(file('later'), doc('later', { date: '2026-11-05' }));
  repo.commit('2026-11-05T12:00:00Z');
  const catalog = readCatalog(repo);
  const eligible = eligibleArticles(catalog, NOW);
  assert.deepEqual(new Set(eligible.map(item => item.id)), new Set(['draft', 'new-route', 'later']));
  const renamed = eligible.find(item => item.id === 'new-route');
  assert.equal(renamed.stableId, direct.stableId);
  assert.deepEqual(renamed.release, direct.release);
  assert.notEqual(renamed.revision, direct.revision);
  assert.equal(renamed.url, `${SITE}/zh/new-route/`);
  assert.equal(eligibleArticles(catalog, Date.parse('2026-12-01')).at(-1).id, 'future');
  assert.ok(!Object.values(productionIndex(catalog).revisions).some(revision => revision.url.endsWith('/private/')));

  const xml = await (await distributionFeed({ catalog, site: SITE, now: NOW, cwd: repo.cwd })).text();
  const originalXml = await (await distributionFeed({
    catalog: { ...catalog, articles: before }, site: SITE, now: NOW, cwd: repo.cwd,
  })).text();
  const guid = `<guid isPermaLink="false">urn:reasonforhim:article:${direct.stableId}</guid>`;
  assert.ok(xml.includes(guid) && originalXml.includes(guid));
  assert.equal((xml.match(/<item>/g) ?? []).length, 3);
  assert.match(xml, /<link>https:\/\/reasonforhim.com\/zh\/new-route\/<\/link>/);
  assert.match(xml, /<pubDate>Tue, 03 Nov 2026 12:00:00 GMT<\/pubDate>/);
  assert.match(xml, /中文摘要 &amp;amp; &amp;lt;原文&amp;gt;/);
  assert.match(xml, /<enclosure[^>]+cover.webp[^>]+length="17"[^>]+type="image\/webp"/);
});

test('explicitly re-enabling an excluded new article makes it eligible once without reviving old articles', async t => {
  const repo = repository(t);
  repo.setConfig(null);
  const excluded = 'syndicate: false\n';
  const included = 'syndicate: true\n';
  repo.write(file('already-public'), doc('already-public', { fields: excluded }));
  const baseline = repo.commit('2026-11-01T12:00:00Z');
  repo.setConfig(baseline);
  repo.write(file('new'), doc('new', { fields: excluded }));
  repo.write(file('migration'), doc('migration', { date: '2025-01-01', fields: excluded }));
  repo.commit('2026-11-02T12:00:00Z');
  const original = readCatalog(repo).articles.find(item => item.id === 'new');

  repo.write(file('new'), doc('new'));
  repo.write(file('already-public'), doc('already-public', { fields: included }));
  repo.write(file('migration'), doc('migration', { fields: included }));
  repo.commit('2026-11-03T12:00:00Z');
  assert.deepEqual(eligibleArticles(readCatalog(repo), NOW), []);

  const enabledAt = '2026-11-04T12:00:00Z';
  repo.write(file('new'), doc('new', { fields: included }));
  repo.commit(enabledAt);
  const catalog = readCatalog(repo);
  const eligible = eligibleArticles(catalog, NOW);
  assert.deepEqual(eligible.map(item => item.id), ['new']);
  assert.equal(eligible[0].stableId, original.stableId);
  assert.equal(eligible[0].release.at, Date.parse(enabledAt));
  const xml = await (await distributionFeed({ catalog, site: SITE, now: NOW, cwd: repo.cwd })).text();
  assert.equal((xml.match(/<item>/g) ?? []).length, 1);
  assert.ok(xml.includes(`urn:reasonforhim:article:${original.stableId}`));
  assert.match(xml, /<pubDate>Wed, 04 Nov 2026 12:00:00 GMT<\/pubDate>/);

  repo.write(file('new'), doc('new', { fields: included, content: 'Later edit.' }));
  repo.commit('2026-11-05T12:00:00Z');
  assert.deepEqual(eligibleArticles(readCatalog(repo), NOW)[0].release, eligible[0].release);
});

test('ambiguous full rewrite is quarantined until an alias recovers the original identity', t => {
  const repo = repository(t);
  repo.setConfig(null);
  repo.write(file('old'), doc('old'));
  const baseline = repo.commit('2026-11-01T12:00:00Z');
  repo.setConfig(baseline);
  const original = readCatalog(repo).articles[0];
  rmSync(join(repo.cwd, file('old')));
  repo.write(file('new'), doc('new', { content: '完全不同的段落。'.repeat(1000) }));
  repo.commit();
  const uncertain = readCatalog(repo);
  assert.equal(uncertain.articles[0].identityUncertain, true);
  assert.deepEqual(eligibleArticles(uncertain, NOW), []);
  repo.setConfig(baseline, { [file('new')]: file('old') });
  const fixed = readCatalog(repo);
  assert.equal(fixed.articles[0].stableId, original.stableId);
  assert.deepEqual(eligibleArticles(fixed, NOW), []);
});

test('ledger survives a fresh Git fetch and rejects a stale writer or second initialization', t => {
  const repo = repository(t);
  const remote = join(repo.cwd, '.git', 'test-remote');
  git(['init', '--bare', remote], repo.cwd);
  repo.repoGit(['remote', 'add', 'origin', remote]);
  assert.throws(() => openLedger({ cwd: repo.cwd, baseline: BASELINE }), /缺失/);
  openLedger({ cwd: repo.cwd, baseline: BASELINE, initialize: true });
  const first = openLedger({ cwd: repo.cwd, baseline: BASELINE });
  const second = openLedger({ cwd: repo.cwd, baseline: BASELINE });
  first.data.retryAt = 100;
  first.save();
  second.data.retryAt = 200;
  assert.throws(() => second.save(), /写入失败/);
  assert.equal(openLedger({ cwd: repo.cwd, baseline: BASELINE }).data.retryAt, 100);
  assert.throws(() => openLedger({ cwd: repo.cwd, baseline: BASELINE, initialize: true }), /已存在/);
  assert.throws(() => openLedger({ cwd: repo.cwd, baseline: 'b'.repeat(40) }), /基线不一致/);
});

test('Cloudflare production builds recover shallow history while previews expose no distribution articles', t => {
  const repo = repository(t);
  repo.setConfig(null);
  repo.write(file('old'), doc('old'));
  const baseline = repo.commit('2026-11-01T12:00:00Z');
  repo.setConfig(baseline);
  repo.write(file('new'), doc('new'));
  repo.commit('2026-11-03T12:00:00Z');
  const expected = readCatalog(repo);

  for (const [provider, enabled, branch] of [
    ['workers', 'WORKERS_CI', 'WORKERS_CI_BRANCH'],
    ['pages', 'CF_PAGES', 'CF_PAGES_BRANCH'],
  ]) {
    const cwd = join(repo.cwd, '.git', provider);
    git(['clone', '--depth=1', pathToFileURL(repo.cwd).href, cwd], repo.cwd);
    assert.equal(git(['rev-parse', '--is-shallow-repository'], cwd), 'true');
    assert.deepEqual(readDeploymentCatalog({ cwd, env: { [enabled]: '1', [branch]: 'preview' } }),
      { baseline: null, articles: [] });
    assert.throws(() => readDeploymentCatalog({ cwd, env: {} }), /基线不在当前分支/);
    assert.deepEqual(readDeploymentCatalog({ cwd, env: { [enabled]: '1', [branch]: 'main' } }), expected);
    assert.equal(git(['rev-parse', '--is-shallow-repository'], cwd), 'false');
  }
});

test('public build emits both routes and keeps them empty without a baseline', () => {
  const { baseline } = JSON.parse(readFileSync('syndication.config.json', 'utf8'));
  const xml = readFileSync('dist/zh/distribution.xml', 'utf8');
  const index = JSON.parse(readFileSync('dist/distribution-status.json', 'utf8'));
  assert.match(xml, /<rss\b/);
  assert.equal(index.baseline, baseline);
  if (!baseline) {
    assert.doesNotMatch(xml, /<item>/);
    assert.deepEqual(index.revisions, {});
  }
});

test('X counting handles CJK, combining marks, flags, and family emoji without cutting graphemes or canonical URLs', () => {
  assert.equal(xWeightedLength('恩典'), 4);
  assert.equal(xWeightedLength('👨‍👩‍👧‍👦🇨🇳👍🏽'), 6);
  assert.equal(xWeightedLength('cafe\u0301'), 4);
  assert.equal(xWeightedLength(`${SITE}/zh/a-very-long-article-slug/`), 23);
  assert.equal(truncateToWeight('👨‍👩‍👧‍👦'.repeat(20), 6), '👨‍👩‍👧‍👦👨‍👩‍👧‍👦…');
  const post = composePost({ ...article(1), title: '题'.repeat(250), description: '摘要'.repeat(260) });
  assert.ok(xWeightedLength(post) <= 280 && post.endsWith(article(1).url));
  assert.deepEqual(hashtagsFrom(['基督徒的自由', 'C.S. Lewis', '2026', '恩典', '恩典']), ['#基督徒的自由', '#CSLewis', '#恩典']);
  assert.equal(canonicalFromHtml('<head><link href="https://a/x/" rel="canonical"></head>'), 'https://a/x/');
});

test('Buffer inputs follow the documented scheduling mode and service-specific metadata', () => {
  const post = article(1);
  assert.deepEqual(buildCreatePostInput({ channel: X, text: post.url, article: post, mode: 'shareNow' }), {
    channelId: X.id, text: post.url, schedulingType: 'automatic', mode: 'shareNow',
    assets: [], needsApproval: false, saveToDraft: false,
  });
  assert.deepEqual(buildCreatePostInput({ channel: FACEBOOK, text: post.url, article: post, mode: 'addToQueue' }).metadata,
    { facebook: { type: 'post', linkAttachment: { url: post.url } } });
});

function fixture({ items = [article(1)], create, channels = [X, FACEBOOK], historyCount = 0, status, beforeSave } = {}) {
  let persisted = { version: 1, baseline: BASELINE, retryAt: 0, articles: {} };
  const catalog = { baseline: BASELINE, articles: items };
  let timestamp = NOW;
  let deployment = true;
  let canonical = true;
  let preflight = true;
  let stale = false;
  const writes = [];
  const calls = [];
  const posts = new Map();
  for (let i = 0; i < historyCount; i++) posts.set(`older-${i}`, { id: `older-${i}`, status: 'sent', channelId: X.id });
  const good = input => ({ id: `post-${writes.length}`, channelId: input.channelId, status: 'sent' });
  const response = data => new Response(JSON.stringify({ data }), { status: 200 });
  const deps = {
    now: () => timestamp,
    readCatalog: () => catalog,
    openLedger: () => {
      const data = structuredClone(persisted);
      return { data, save() { beforeSave?.(data); persisted = structuredClone(data); } };
    },
    fetchImpl: async url => {
      if (!deployment) return new Response('', { status: 503 });
      const target = new URL(url);
      if (target.pathname === '/distribution-status.json') {
        const index = productionIndex(catalog);
        if (stale) for (const item of Object.values(index.revisions)) item.revision = 'older-deployment';
        return Response.json(index);
      }
      return new Response(`<link rel="canonical" href="${canonical ? SITE + target.pathname : SITE}">`);
    },
    request: createBufferClient({ apiKey: 'fake-key', now: () => timestamp, fetchImpl: async (endpoint, options) => {
      assert.equal(endpoint, 'https://api.buffer.com');
      const { query, variables } = JSON.parse(options.body);
      calls.push(query);
      if (query.includes('query Channels')) {
        return preflight ? response({ channels }) : new Response('', { status: 503 });
      }
      if (query.includes('mutation CreatePost')) {
        const { input } = variables;
        const key = Object.keys(persisted.articles).find(id =>
          persisted.articles[id].targets.some(target => target.channelId === input.channelId && target.state === 'unknown'));
        assert.ok(key, 'the mutation must be preceded by a durable unknown record');
        writes.push(input);
        if (create) {
          const result = await create({ input, good, response, writes, posts });
          if (result) return result;
        }
        const post = good(input);
        posts.set(post.id, post);
        return response({ createPost: { __typename: 'PostActionSuccess', post } });
      }
      if (query.includes('query DistributionPost')) {
        const { id } = variables.input;
        return response({ post: status ? status(posts.get(id)) : posts.get(id) });
      }
      assert.fail(`Unexpected API operation: ${query}`);
    } }),
  };
  const targets = (id = items[0].stableId) => persisted.articles[id]?.targets ?? [];
  return {
    catalog, deps, writes, calls, targets, posts,
    advance: (ms = THREE_HOURS) => { timestamp += ms; },
    setDeployment: live => { deployment = live; },
    setStale: value => { stale = value; },
    setCanonical: valid => { canonical = valid; },
    setPreflight: live => { preflight = live; },
  };
}

test('a separate production verification origin still publishes the public canonical link', async () => {
  const f = fixture();
  const verificationOrigin = 'https://production.example.workers.dev';
  const originalFetch = f.deps.fetchImpl;
  const verificationRequests = [];
  f.deps.fetchImpl = async url => {
    const target = new URL(url);
    verificationRequests.push(`${target.origin}${target.pathname}`);
    return originalFetch(url);
  };
  const result = await run(config({ DISTRIBUTION_VERIFY_ORIGIN: verificationOrigin }), f.deps);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(verificationRequests, [
    `${verificationOrigin}/distribution-status.json`, `${verificationOrigin}/zh/article-1/`,
  ]);
  assert.ok(f.writes[0].text.endsWith(article(1).url));
});

test('auto dedupes by stable ID after >50 Buffer posts, renames and repeated schedules; identical titles can publish', async () => {
  const f = fixture({ items: [article(1), article(2)], historyCount: 80 });
  await run(config(), f.deps);
  assert.equal(f.writes.length, 2);
  assert.equal(f.targets()[0].state, 'sent');
  Object.assign(f.catalog.articles[0], { id: 'renamed', revision: 'new', url: `${SITE}/zh/renamed/` });
  for (let i = 0; i < 60; i++) f.posts.set(`newer-${i}`, { id: `newer-${i}`, status: 'sent' });
  f.advance();
  await run(config(), f.deps);
  assert.equal(f.writes.length, 2);
  assert.equal(f.calls.length, 3);
});

test('each run limits the article batch and subsequent schedules drain it without repeats', async () => {
  const f = fixture({ items: [article(1), article(2), article(3), article(4)] });
  const limited = config({ MAX_ARTICLES_PER_RUN: '2' });
  assert.match((await run(limited, f.deps)).lines.join('\n'), /本轮上限 2 篇/);
  assert.equal(f.writes.length, 2);
  f.advance();
  await run(limited, f.deps);
  assert.equal(f.writes.length, 4);
});

test('deployment failure and wrong canonical block only external sends; scheduled checks pick up deployment later', async () => {
  const f = fixture();
  f.setDeployment(false);
  assert.match((await run(config(), f.deps)).failures[0], /生产部署/);
  f.setDeployment(true);
  f.setStale(true);
  f.advance();
  assert.match((await run(config(), f.deps)).failures[0], /当前版本尚未部署/);
  f.setStale(false);
  f.setCanonical(false);
  f.advance();
  assert.match((await run(config(), f.deps)).failures[0], /canonical/);
  assert.equal(f.writes.length, 0);
  f.setCanonical(true);
  f.advance();
  await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'sent');
});

test('a push waits through an unavailable index and a stale revision before sending once', async () => {
  const f = fixture();
  f.setDeployment(false);
  f.setStale(true);
  let waits = 0;
  f.deps.delay = async ms => {
    assert.equal(ms, 20_000);
    assert.equal(f.calls.length, 0);
    if (++waits === 1) f.setDeployment(true);
    else f.setStale(false);
  };

  const result = await run(config({ GITHUB_EVENT_NAME: 'push' }), f.deps);
  assert.deepEqual(result.failures, []);
  assert.equal(waits, 2);
  assert.equal(f.targets()[0].state, 'sent');
  await run(config({ GITHUB_EVENT_NAME: 'schedule' }), f.deps);
  assert.equal(f.writes.length, 1);
});

test('a slow deployment is deferred on push and flagged if it is still stale on the scheduled run', async () => {
  const f = fixture();
  f.setStale(true);
  let waits = 0;
  f.deps.delay = async () => { waits++; };

  const pushed = await run(config({ GITHUB_EVENT_NAME: 'push' }), f.deps);
  assert.equal(waits, 9);
  assert.deepEqual(pushed.failures, []);
  assert.match(pushed.lines.join('\n'), /当前版本尚未部署/);
  assert.equal(f.calls.length, 0);
  assert.deepEqual(f.targets(), []);

  const scheduled = config({ GITHUB_EVENT_NAME: 'schedule' });
  assert.match((await run(scheduled, f.deps)).failures[0], /当前版本尚未部署/);
  assert.equal(waits, 9);
  f.setStale(false);
  await run(scheduled, f.deps);
  assert.equal(f.writes.length, 1);
});

test('a push still reports an index that cannot be loaded after waiting', async () => {
  const f = fixture();
  f.deps.delay = async () => {};
  f.setDeployment(false);
  const result = await run(config({ GITHUB_EVENT_NAME: 'push' }), f.deps);
  assert.match(result.failures[0], /生产部署.*HTTP 503/);
  assert.equal(f.calls.length, 0);
});

test('a temporary API outage on a read check is safe to compensate', async () => {
  const f = fixture();
  f.setPreflight(false);
  await assert.rejects(run(config(), f.deps), /HTTP_503/);
  assert.equal(f.writes.length, 0);
  f.setPreflight(true);
  f.advance();
  await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'sent');
});

test('one channel can succeed while another fails permanently, then be explicitly retried without repeating success', async () => {
  const f = fixture({ create: ({ input, response, writes }) => {
    if (input.channelId === FACEBOOK.id && writes.length === 2) {
      return response({ createPost: { __typename: 'InvalidInputError', message: 'do-not-log-secret' } });
    }
  } });
  const both = config({ BUFFER_CHANNEL_IDS: `${X.id},${FACEBOOK.id}` });
  const result = await run(both, f.deps);
  assert.deepEqual(f.targets().map(item => item.state), ['sent', 'failed']);
  assert.match(result.failures[0], /InvalidInputError/);
  assert.doesNotMatch(result.failures.join('\n'), /do-not-log-secret/);
  await run(both, f.deps);
  assert.equal(f.writes.length, 2);
  await run(config({
    BUFFER_CHANNEL_IDS: `${X.id},${FACEBOOK.id}`, ACTION: 'retry-one',
    ARTICLE: 'zh/article-1', CHANNEL_ID: FACEBOOK.id, CONFIRM: 'true', SOCIAL_DISTRIBUTION_MANUAL_ENABLED: 'true',
  }), f.deps);
  assert.deepEqual(f.targets().map(item => item.state), ['sent', 'sent']);
  assert.deepEqual(f.writes.map(item => item.channelId), [X.id, FACEBOOK.id, FACEBOOK.id]);
});

test('429 persists Retry-After and a scheduled run resumes the rejected request', async () => {
  const f = fixture({ create: ({ writes }) => writes.length === 1 &&
    new Response('', { status: 429, headers: { 'Retry-After': '14500' } }) });
  await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'pending');
  f.advance();
  assert.match((await run(config(), f.deps)).lines[0], /限流/);
  assert.equal(f.writes.length, 1);
  f.advance();
  await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'sent');
  assert.equal(f.writes.length, 2);
});

test('Buffer accepts but response times out, or the run dies before saving its response; neither is blindly retried', async t => {
  await t.test('timeout after acceptance can be reconciled with a manually verified post ID', async () => {
    const f = fixture({ create: ({ input, good, posts }) => {
      const post = good(input);
      posts.set(post.id, post);
      throw new DOMException('Timed out', 'TimeoutError');
    } });
    assert.match((await run(config(), f.deps)).failures[0], /TRANSPORT_UNCERTAIN/);
    assert.equal(f.targets()[0].state, 'unknown');
    f.advance();
    await run(config(), f.deps);
    assert.equal(f.writes.length, 1);
    await run(config({
      ACTION: 'reconcile-one', ARTICLE: 'zh/article-1', CHANNEL_ID: X.id, POST_ID: 'post-1', CONFIRM: 'true',
      SOCIAL_DISTRIBUTION_ENABLED: 'false',
    }), f.deps);
    assert.equal(f.targets()[0].state, 'sent');
    assert.equal(f.writes.length, 1);
  });
  await t.test('aborted ledger save leaves a durable in-flight record', async () => {
    const f = fixture({ beforeSave: data => {
      if (Object.values(data.articles)[0]?.targets[0].state === 'sent') throw new Error('run terminated');
    } });
    await assert.rejects(run(config(), f.deps), /run terminated/);
    assert.equal(f.targets()[0].code, 'MUTATION_IN_FLIGHT');
    f.advance();
    assert.match((await run(config(), f.deps)).failures[0], /MUTATION_IN_FLIGHT/);
    assert.equal(f.writes.length, 1);
  });
});

test('scheduled and sending posts are confirmed by ID as sent or retained as a failed original post', async () => {
  const f = fixture({
    items: [article(1), article(2)],
    create: ({ input, response, good, posts }) => {
      const post = { ...good(input), status: 'scheduled', dueAt: new Date(NOW + THREE_HOURS).toISOString() };
      posts.set(post.id, post);
      return response({ createPost: { __typename: 'PostActionSuccess', post } });
    },
    status: post => ({ ...post, status: post.id === 'post-1' ? 'sent' : 'error' }),
  });
  await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'submitted');
  f.advance();
  const report = await run(config(), f.deps);
  assert.equal(f.targets()[0].state, 'sent');
  assert.equal(f.targets()[0].postId, 'post-1');
  assert.equal(f.targets(article(2).stableId)[0].postId, 'post-2');
  assert.match(report.failures[0], /BUFFER_PUBLISHING_ERROR/);
  assert.equal(f.writes.length, 2);
});

test('disabled auto and dry-run are side effect free; missing configuration and manual permissions fail clearly', async () => {
  const f = fixture();
  const forbidden = () => assert.fail('unexpected side effect');
  const deps = { ...f.deps, request: forbidden, openLedger: forbidden, fetchImpl: forbidden };
  const disabled = await run(config({ SOCIAL_DISTRIBUTION_ENABLED: 'false' }), { ...deps, readCatalog: forbidden });
  assert.match(disabled.lines[0], /已停用/);
  const preview = await run(config({ ACTION: 'dry-run', BUFFER_API_KEY: '', ARTICLE: 'zh/article-1' }), deps);
  assert.match(preview.previews[0].text, /新文章/);
  await assert.rejects(run(config({ BUFFER_API_KEY: '' }), deps), /BUFFER_API_KEY/);
  await assert.rejects(run(config({ BUFFER_CHANNEL_IDS: '' }), deps), /BUFFER_CHANNEL_IDS/);
  await assert.rejects(run(config({ ACTION: 'publish-one', ARTICLE: 'zh/article-1', CHANNEL_ID: X.id, CONFIRM: 'true' }), deps),
    /人工发帖未启用/);
  const manual = config({
    ACTION: 'publish-one', ARTICLE: 'zh/article-1', CHANNEL_ID: X.id, CONFIRM: 'true',
    SOCIAL_DISTRIBUTION_ENABLED: 'false', SOCIAL_DISTRIBUTION_MANUAL_ENABLED: 'true',
  });
  await run(manual, f.deps);
  await run(manual, f.deps);
  assert.equal(f.writes.length, 1);
  assert.match((await run(config({ ACTION: 'list-channels' }), f.deps)).lines[1], /Test X/);
  assert.equal(f.writes.length, 1);
});
