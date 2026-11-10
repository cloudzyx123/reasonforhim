import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { sharePolicy } from '../src/lib/share.mjs';

const source = fs.readFileSync('src/lib/share-client.ts', 'utf8')
  .replace("import { sharePolicy } from './share.mjs';", '')
  .replace('export function initShare', 'function initShare') + '\nglobalThis.initShare = initShare;';
const code = transformSync(source, { loader: 'ts' }).code;

function element() {
  const events = {};
  return { hidden: true, textContent: '', events, addEventListener(type, callback) { events[type] = callback; },
    querySelector() { return null; }, focus() {}, select() {} };
}

function root(url) {
  const copy = element();
  const native = element();
  const status = element();
  const fallback = element();
  const platforms = [element(), element()];
  const fields = { '[data-share-status]': status, '[data-copy-fallback]': fallback,
    '[data-copy-link]': copy, '[data-native-share]': native, '[data-wechat-hint]': element() };
  return { dataset: { lang: 'zh', url, title: '标题', description: '简介' }, copy, native, status, fallback, platforms,
    querySelector(selector) { return fields[selector] ?? null; },
    querySelectorAll(selector) { return selector === '[data-platform]' ? platforms : []; } };
}

test('two sharing roots keep copy feedback and fallback independent', async () => {
  const first = root('https://reasonforhim.com/zh/one/');
  const second = root('https://reasonforhim.com/zh/two/');
  const copied = [];
  const context = { sharePolicy, navigator: { userAgent: 'Desktop', clipboard: { async writeText(value) { copied.push(value); } } },
    matchMedia: () => ({ matches: false, addEventListener() {} }), document: { execCommand: () => false },
    DOMException, setTimeout: () => 1, clearTimeout() {} };
  vm.runInNewContext(code, context);
  context.initShare(first);
  context.initShare(second);
  await first.copy.events.click();
  assert.deepEqual(copied, [first.dataset.url]);
  assert.equal(first.copy.textContent, '已复制');
  assert.equal(second.copy.textContent, '');
  await second.copy.events.click();
  assert.deepEqual(copied, [first.dataset.url, second.dataset.url]);
  assert.equal(second.status.textContent, '文章链接已复制。');
});
