#!/usr/bin/env node
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import twitterText from 'twitter-text';
import { eligibleArticles, isPublic, productionIndexPath, readCatalog, SITE } from '../src/lib/syndication.mjs';
import {
  buildCreatePostInput, createBufferClient, createPost, fetchChannels, fetchPost, resolveOrganizationId, supportedService,
} from './buffer-client.mjs';
import { openLedger, validChannelId } from './social-ledger.mjs';

const HOUR = 3_600_000;
const CHECK_INTERVAL = 3 * HOUR;
const ACTIONS = ['auto', 'dry-run', 'list-channels', 'initialize-ledger', 'publish-one', 'retry-one', 'reconcile-one'];
const MANUAL_ARTICLE = /^(zh|en)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function xWeightedLength(text) {
  return twitterText.parseTweet(text).weightedLength;
}

export function truncateToWeight(text, maxWeight) {
  if (xWeightedLength(text) <= maxWeight) return text;
  const ellipsis = '…';
  const budget = maxWeight - xWeightedLength(ellipsis);
  let result = '';
  for (const { segment } of graphemes.segment(text)) {
    if (xWeightedLength(result + segment) > budget) break;
    result += segment;
  }
  result = result.replace(/[\s，,。.、；;：:]+$/u, '');
  return result ? result + ellipsis : '';
}


export function hashtagsFrom(tags, max = 3) {
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const clean = String(tag).normalize('NFC').replace(/[^\p{L}\p{N}_]/gu, '');
    if (!clean || /^\p{N}+$/u.test(clean) || seen.has(clean)) continue;
    seen.add(clean);
    result.push(`#${clean}`);
    if (result.length === max) break;
  }
  return result;
}

const HEADLINE = {
  zh: title => `新文章｜${title}`,
  en: title => `New post: ${title}`,
};

function assemble({ lang, title, description, hashtags, url }) {
  return [HEADLINE[lang](title), description, hashtags.join(' '), url].filter(Boolean).join('\n\n');
}

// 文字超过 X 上限时，依次去掉话题标签、截短摘要、去掉摘要、截短标题；网址永不截断。
export function composePost(article, { maxWeight = 280, useHashtags = false } = {}) {
  const parts = {
    lang: article.lang,
    title: article.title,
    description: article.description,
    hashtags: useHashtags ? hashtagsFrom(article.tags) : [],
    url: article.url,
  };
  let text = assemble(parts);
  if (xWeightedLength(text) <= maxWeight) return text;

  parts.hashtags = [];
  text = assemble(parts);
  if (xWeightedLength(text) <= maxWeight) return text;

  const withoutDescription = assemble({ ...parts, description: '' });
  const descriptionBudget = maxWeight - xWeightedLength(withoutDescription) - xWeightedLength('\n\n');
  if (descriptionBudget >= 20) {
    parts.description = truncateToWeight(parts.description, descriptionBudget);
    text = assemble(parts);
    if (xWeightedLength(text) <= maxWeight) return text;
  }

  parts.description = '';
  const withoutTitle = assemble({ ...parts, title: '' });
  const titleBudget = maxWeight - xWeightedLength(withoutTitle);
  parts.title = truncateToWeight(parts.title, titleBudget);
  text = assemble(parts);
  if (xWeightedLength(text) > maxWeight) throw new Error(`${article.file}：帖子文字无法压缩到 ${maxWeight} 以内`);
  return text;
}



export function canonicalFromHtml(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (/\brel\s*=\s*["']?canonical\b/i.test(tag)) return tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1] ?? null;
  }
  return null;
}

async function fetchProduction(url, fetchImpl) {
  const probe = new URL(url);
  probe.searchParams.set('syndication-check', Date.now().toString(36));
  const response = await fetchImpl(probe.href, {
    headers: { 'Cache-Control': 'no-cache', 'User-Agent': 'reasonforhim-social-distribution' },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    throw Object.assign(new Error(`生产站返回 HTTP ${response.status}`), { status: response.status });
  }
  return response;
}

function splitIds(value) {
  const ids = [...new Set((value || '').split(/[\s,，]+/).filter(Boolean))];
  if (ids.some(id => !validChannelId(id))) throw new Error('Buffer 渠道 ID 格式无效');
  return ids;
}

export function readConfig(env = process.env) {
  const action = env.ACTION || 'dry-run';
  if (!ACTIONS.includes(action)) throw new Error('ACTION 无效');
  const mode = env.BUFFER_MODE || 'shareNow';
  if (!['shareNow', 'addToQueue'].includes(mode)) throw new Error('BUFFER_MODE 应为 shareNow 或 addToQueue');
  const article = (env.ARTICLE || '').trim().replace(/^\/+|\/+$/g, '');
  if (article && !MANUAL_ARTICLE.test(article)) throw new Error('ARTICLE 应为 zh/英文网址名 或 en/英文网址名');
  const maxArticles = Number(env.MAX_ARTICLES_PER_RUN || 3);
  if (!Number.isInteger(maxArticles) || maxArticles < 1 || maxArticles > 10) {
    throw new Error('MAX_ARTICLES_PER_RUN 应为 1–10');
  }
  const verificationUrl = new URL(env.DISTRIBUTION_VERIFY_ORIGIN || SITE);
  if (verificationUrl.protocol !== 'https:' || verificationUrl.href !== `${verificationUrl.origin}/`) {
    throw new Error('DISTRIBUTION_VERIFY_ORIGIN 应为 HTTPS 源站地址');
  }
  const fallback = splitIds(env.BUFFER_CHANNEL_IDS);
  return {
    action, mode, article, maxArticles, site: SITE, verificationOrigin: verificationUrl.origin,
    enabled: env.SOCIAL_DISTRIBUTION_ENABLED === 'true',
    manualEnabled: env.SOCIAL_DISTRIBUTION_MANUAL_ENABLED === 'true',
    confirmed: env.CONFIRM === 'true',
    apiKey: env.BUFFER_API_KEY?.trim(),
    organizationId: env.BUFFER_ORGANIZATION_ID?.trim(),
    channelId: env.CHANNEL_ID?.trim(),
    postId: env.POST_ID?.trim(),
    channelIds: {
      zh: env.BUFFER_CHANNEL_IDS_ZH ? splitIds(env.BUFFER_CHANNEL_IDS_ZH) : fallback,
      en: env.BUFFER_CHANNEL_IDS_EN ? splitIds(env.BUFFER_CHANNEL_IDS_EN) : fallback,
    },
    testChannelIds: splitIds(env.BUFFER_TEST_CHANNEL_IDS),
    useHashtags: env.SOCIAL_HASHTAGS === 'true',
  };
}

function statusFromPost(post, now) {
  const details = { postId: post.id, bufferStatus: post.status, retryAt: 0, code: null };
  if (post.status === 'sent') {
    return { ...details, state: 'sent', sentAt: post.sentAt ?? null };
  }
  if (post.status === 'error') return { ...details, state: 'failed', code: 'BUFFER_PUBLISHING_ERROR' };
  if (post.status === 'scheduled' || post.status === 'sending') {
    const dueAt = Date.parse(post.dueAt) || 0;
    return { ...details, state: 'submitted', dueAt, retryAt: Math.max(now + CHECK_INTERVAL, dueAt) };
  }
  return { ...details, state: 'unknown', code: 'UNEXPECTED_POST_STATUS' };
}

function updateTarget(ledger, target, next, now) {
  Object.assign(target, next, { updatedAt: now });
  ledger.save();
}

function initialTarget(channelId, now) {
  return { channelId, state: 'pending', createdAt: now, updatedAt: now, retryAt: 0 };
}

function describeTarget(article, target) {
  return `${article} · ${target.channelId} · ${target.state}${target.postId ? ` · Buffer ${target.postId}` : ''}${target.code ? ` · ${target.code}` : ''}`;
}

async function lookupStatus({ target, request, now, postId = target.postId }) {
  const post = await fetchPost(request, postId);
  if (post.channelId !== target.channelId) throw new Error('该 Buffer Post ID 属于另一个渠道');
  return statusFromPost(post, now);
}

function rememberRateLimit(ledger, error, now) {
  if (error.code !== 'RATE_LIMIT_EXCEEDED') return false;
  ledger.data.retryAt = now + Math.max(1_000, error.retryAfterMs);
  return true;
}

function channelProblem(channel, mode) {
  if (!channel) return 'CHANNEL_NOT_FOUND';
  if (!supportedService(channel.service)) return 'UNSUPPORTED_CHANNEL';
  if (channel.isDisconnected) return 'CHANNEL_DISCONNECTED';
  if (channel.isLocked) return 'CHANNEL_LOCKED';
  if (channel.isQueuePaused && mode !== 'shareNow') return 'QUEUE_PAUSED';
  return null;
}

async function submit({ ledger, article, target, channel, config, request, now }) {
  const channelError = channelProblem(channel, config.mode);
  if (channelError) {
    updateTarget(ledger, target, { state: 'failed', code: channelError, retryAt: 0 }, now);
    return false;
  }
  const text = composePost(article, config);
  if (!twitterText.parseTweet(text).valid) {
    updateTarget(ledger, target, { state: 'failed', code: 'INVALID_X_TEXT', retryAt: 0 }, now);
    return false;
  }
  const input = buildCreatePostInput({ channel, text, article, mode: config.mode });
  updateTarget(ledger, target, { state: 'unknown', code: 'MUTATION_IN_FLIGHT', attemptAt: now, url: article.url }, now);
  let post;
  try {
    post = await createPost(request, input);
  } catch (error) {
    const limited = rememberRateLimit(ledger, error, now);
    const state = error.disposition ?? 'unknown';
    updateTarget(ledger, target, {
      state,
      code: error.code ?? 'MUTATION_UNCERTAIN',
      retryAt: state === 'pending' ? now + Math.max(CHECK_INTERVAL, error.retryAfterMs || 0) : 0,
    }, now);
    return limited || error.code === 'CONNECTION_UNAVAILABLE';
  }
  updateTarget(ledger, target, { ...statusFromPost(post, now), submittedAt: now }, now);
  return false;
}

function selectedArticle(catalog, route) {
  const article = catalog.articles.find(item => `${item.lang}/${item.id}` === route);
  if (!article) throw new Error('找不到指定文章，请使用当前的 zh/ 或 en/ 网址名');
  return article;
}

export async function run(config, deps = {}) {
  const now = (deps.now ?? Date.now)();
  const report = { lines: [], previews: [], failures: [] };
  const note = message => report.lines.push(message);
  const fail = message => report.failures.push(message);
  const requestBuffer = () => {
    if (!config.apiKey) throw new Error('缺少 GitHub Secret BUFFER_API_KEY');
    return deps.request ?? createBufferClient({ apiKey: config.apiKey });
  };

  if (config.action === 'auto' && !config.enabled) {
    note('自动分发已停用。');
    return report;
  }
  if (config.action === 'list-channels') {
    const request = requestBuffer();
    const organizationId = await resolveOrganizationId(request, config.organizationId);
    note(`Buffer 组织 ${organizationId}`);
    for (const channel of await fetchChannels(request, organizationId)) {
      note(`${channel.id} · ${channel.service} · ${channel.displayName || channel.name} · ${channelProblem(channel, 'addToQueue') ?? '可用'}`);
    }
    return report;
  }

  const catalog = (deps.readCatalog ?? readCatalog)({ site: config.site });
  const eligible = eligibleArticles(catalog, now);
  for (const article of catalog.articles.filter(item => item.identityUncertain)) {
    fail(`文章身份待核对，请登记 renames · ${article.file}`);
  }
  if (config.action === 'dry-run') {
    const candidates = config.article ? [selectedArticle(catalog, config.article)] : eligible;
    for (const article of candidates.slice(0, config.maxArticles)) {
      if (!isPublic(article, now)) throw new Error('预演文章仍是草稿或发布日期在未来');
      report.previews.push({ url: article.url, text: composePost(article, config) });
    }
    if (!catalog.baseline) note('尚未配置基线。可指定单篇现有文章预演。');
    note(`预演 ${report.previews.length}/${candidates.length} 篇文章。预演只读取本地文章目录。`);
    return report;
  }

  if (!catalog.baseline) throw new Error('缺少自动分发基线，请先配置 syndication.config.json');
  const open = deps.openLedger ?? openLedger;
  if (config.action === 'initialize-ledger') {
    if (!config.confirmed) throw new Error('初始化需要勾选确认');
    open({ baseline: catalog.baseline, initialize: true });
    note('分发账本已初始化。');
    return report;
  }

  const manual = config.action !== 'auto';
  const sendingManually = manual && config.action !== 'reconcile-one';
  if (manual && (!config.confirmed || !config.article || !validChannelId(config.channelId ?? ''))) {
    throw new Error('人工操作需要确认、文章和明确的 Buffer 渠道 ID');
  }
  if (sendingManually && !config.manualEnabled) throw new Error('人工发帖未启用');
  if (!manual && !Object.values(config.channelIds).some(ids => ids.length)) {
    throw new Error('未配置 BUFFER_CHANNEL_IDS 或按语言配置的 Buffer 渠道');
  }

  const request = requestBuffer();
  const ledger = open({ baseline: catalog.baseline });
  if (ledger.data.retryAt > now) {
    note(`Buffer 限流，等待至 ${new Date(ledger.data.retryAt).toISOString()}，定时运行会补偿。`);
    if (manual) fail('人工操作尚未执行');
    return report;
  }
  const articles = ledger.data.articles;
  const chosen = manual ? selectedArticle(catalog, config.article) : null;

  if (config.action === 'reconcile-one') {
    const target = articles[chosen.stableId]?.targets.find(item => item.channelId === config.channelId);
    const postId = config.postId || target?.postId;
    if (!target || target.state === 'sent' || !postId || (target.postId && target.postId !== postId)) {
      throw new Error('无法核对该记录，请检查渠道、状态和原 Buffer Post ID');
    }
    const status = await lookupStatus({ target, request, now, postId });
    updateTarget(ledger, target, status, now);
    note(describeTarget(chosen.url, target));
    if (target.state === 'unknown' || target.state === 'failed') fail('Buffer 帖子仍需检查');
    return report;
  }

  if (manual && (!isPublic(chosen, now) || chosen.excluded || chosen.identityUncertain)) throw new Error('该文章当前不可分发');
  if (manual && ![...config.channelIds[chosen.lang], ...config.testChannelIds].includes(config.channelId)) {
    throw new Error('该人工测试渠道未获配置授权');
  }
  if (config.action === 'retry-one') {
    const target = articles[chosen.stableId]?.targets.find(item => item.channelId === config.channelId);
    if (!target || target.postId || !['failed', 'unknown'].includes(target.state)) {
      throw new Error('补发仅适用于无 Buffer Post ID 的 failed 或 unknown 记录；已有帖子请在 Buffer 中处理');
    }
  }

  if (!manual) {
    // Poll submitted posts by ID. Never search a rolling list or create another post for these records.
    let checked = 0;
    for (const entry of Object.values(articles)) {
      for (const target of entry.targets) {
        if (target.state !== 'submitted' || target.retryAt > now || checked >= 10) continue;
        checked++;
        const overdue = now - Math.max(target.submittedAt ?? target.createdAt, target.dueAt ?? 0) > 7 * 24 * HOUR;
        let status;
        try {
          status = await lookupStatus({ target, request, now });
        } catch (error) {
          const limited = rememberRateLimit(ledger, error, now);
          if (limited) {
            ledger.save();
            note('Buffer 查询限流，定时运行会继续核对。');
            return report;
          }
          if (error.code === 'NOT_FOUND' || error.code === 'HTTP_404'
            || overdue) {
            status = { state: 'unknown', code: 'BUFFER_POST_UNVERIFIABLE' };
          } else {
            fail(`Buffer 帖子 ${target.postId} 查询失败 · ${error.code ?? 'CHANNEL_MISMATCH'}，下一次运行将重新核对。`);
          }
        }
        if (overdue && status?.state === 'submitted' && status.dueAt <= now) {
          status = { ...status, state: 'unknown', code: 'BUFFER_POST_OVERDUE' };
        }
        if (status) updateTarget(ledger, target, status, now);
        note(describeTarget(entry.url, target));
      }
    }
    for (const entry of Object.values(articles)) {
      for (const target of entry.targets) {
        if (target.state === 'unknown' || target.state === 'failed') fail(describeTarget(entry.url, target));
        const lang = new URL(entry.url).pathname.split('/')[1];
        if (entry.planned && target.state === 'pending' && !config.channelIds[lang]?.includes(target.channelId)) {
          note(`已暂停未配置的渠道 · ${describeTarget(entry.url, target)}`);
        }
      }
    }
  }

  const candidates = manual ? [chosen] : eligible.filter(article => {
    const entry = articles[article.stableId];
    if (!config.channelIds[article.lang].length) return false;
    return !entry?.planned || entry.targets.some(target => target.state === 'pending'
      && target.retryAt <= now && config.channelIds[article.lang].includes(target.channelId));
  });
  if (!candidates.length) {
    note('没有待提交的文章。');
    return report;
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  let index;
  try {
    const indexUrl = new URL(productionIndexPath, config.verificationOrigin);
    index = await (await fetchProduction(indexUrl, fetchImpl)).json();
    if (index?.baseline !== catalog.baseline || !index.revisions) throw new Error('基线未部署');
  } catch (error) {
    const status = error.status ? `（HTTP ${error.status}）` : '';
    fail(`生产部署尚未提供匹配的分发索引${status}。定时运行会重新检查。`);
    return report;
  }
  const ready = candidates.filter(article => {
    const live = index.revisions[article.stableId];
    return live?.revision === article.revision && live.url === article.url;
  });
  if (ready.length !== candidates.length) {
    fail(`${candidates.length - ready.length} 篇文章的当前版本尚未部署，定时运行会重新检查。`);
  }
  if (!ready.length) return report;

  let channels;
  try {
    const organizationId = await resolveOrganizationId(request, config.organizationId);
    channels = new Map((await fetchChannels(request, organizationId)).map(channel => [channel.id, channel]));
  } catch (error) {
    if (!rememberRateLimit(ledger, error, now)) throw error;
    ledger.save();
    note('Buffer 渠道查询限流，定时运行会继续处理。');
    if (manual) fail('人工操作尚未执行');
    return report;
  }

  if (ready.length > config.maxArticles) note(`本轮上限 ${config.maxArticles} 篇，其余将在定时运行中继续处理。`);
  for (const article of ready.slice(0, config.maxArticles)) {
    try {
      const verificationUrl = new URL(new URL(article.url).pathname, config.verificationOrigin);
      const response = await fetchProduction(verificationUrl, fetchImpl);
      if (canonicalFromHtml(await response.text()) !== article.url) throw new Error('canonical 不匹配');
    } catch (error) {
      const status = error.status ? `（HTTP ${error.status}）` : '';
      fail(`生产页面尚未通过 canonical 检查${status} · ${article.url}`);
      continue;
    }

    const entry = articles[article.stableId] ??= { url: article.url, planned: false, targets: [] };
    entry.url = article.url;
    const ids = manual ? [config.channelId] : config.channelIds[article.lang];
    if (!entry.planned || manual) {
      for (const id of ids) {
        if (!entry.targets.some(target => target.channelId === id)) entry.targets.push(initialTarget(id, now));
      }
      if (!manual) entry.planned = true;
      ledger.save();
    }

    const targets = entry.targets.filter(target => ids.includes(target.channelId));
    for (const target of targets) {
      const isRetry = config.action === 'retry-one';
      if (!isRetry && (target.state !== 'pending' || target.retryAt > now)) {
        if (manual) note(describeTarget(article.url, target));
        if (manual && target.state !== 'sent' && target.state !== 'submitted') fail('人工发帖未执行，请先核对现有记录');
        continue;
      }
      const stop = await submit({ ledger, article, target, channel: channels.get(target.channelId), config, request, now });
      note(describeTarget(article.url, target));
      if (target.state === 'unknown' || target.state === 'failed' || (manual && target.state === 'pending')) {
        fail(describeTarget(article.url, target));
      }
      if (stop) {
        note('本轮停止提交，待处理项目保持 pending。');
        return report;
      }
    }
  }
  return report;
}

function html(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function main() {
  const report = await run(readConfig());
  const lines = [...report.lines, ...report.failures.map(message => `需处理 · ${message}`)];
  for (const preview of report.previews) lines.push(`\n${preview.url}\n${preview.text}`);
  const output = lines.join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 社交分发\n\n<pre>${html(output)}</pre>\n`);
    if (report.failures.length) console.error(report.failures.join('\n'));
  } else {
    console.log(output);
  }
  if (report.failures.length) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error.message.split('\n', 1)[0];
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## 社交分发\n\n<pre>${html(message)}</pre>\n`);
    console.error(message);
    process.exitCode = 1;
  });
}
