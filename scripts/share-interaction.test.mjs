import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const component = fs.readFileSync('src/components/ShareActions.astro', 'utf8');
const script = component.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'ShareActions client script exists');
const code = transformSync(script, { loader: 'ts' }).code;

function run(userAgent, hasWechatUrl) {
  const listeners = new Map();
  const button = {
    attrs: { 'aria-expanded': 'false' },
    addEventListener(event, callback) { listeners.set(event, callback); },
    setAttribute(name, value) { this.attrs[name] = value; },
  };
  const qr = { hidden: true };
  const hint = { hidden: true };
  const link = hasWechatUrl ? { hidden: false, setAttribute(name) { if (name === 'hidden') this.hidden = true; } } : null;
  const fields = {
    '[data-share-status]': { textContent: '' }, '[data-copy-fallback]': { hidden: true },
    '[data-wechat-hint]': hint, '[data-wechat-open]': link,
    '#wechat-panel': qr, '[data-native-share]': { hidden: true },
  };
  const panel = {
    dataset: { lang: 'zh', url: 'https://reasonforhim.com/zh/example/' },
    querySelector(selector) { return fields[selector] ?? null; },
    querySelectorAll(selector) { return selector === '[data-wechat-toggle]' ? [button] : []; },
  };
  vm.runInNewContext(code, {
    document: { querySelector() { return panel; } },
    navigator: { userAgent },
    DOMException,
  });
  return { button, qr, hint, link, click: () => listeners.get('click')() };
}

test('desktop, mobile, and WeChat keep QR toggle and direct article link consistent', () => {
  for (const userAgent of ['Desktop Chrome', 'Mobile Safari', 'MicroMessenger Mobile']) {
    for (const hasWechatUrl of [false, true]) {
      const ui = run(userAgent, hasWechatUrl);
      assert.equal(ui.hint.hidden, !userAgent.includes('MicroMessenger'));
      if (hasWechatUrl) assert.equal(ui.link.hidden, false);
      else assert.equal(ui.link, null);
      assert.equal(ui.qr.hidden, true);
      assert.equal(ui.button.attrs['aria-expanded'], 'false');
      ui.click();
      assert.equal(ui.qr.hidden, false);
      assert.equal(ui.button.attrs['aria-expanded'], 'true');
      ui.click();
      assert.equal(ui.qr.hidden, true);
      assert.equal(ui.button.attrs['aria-expanded'], 'false');
    }
  }
});
