import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'parse5';
import { canonicalUrl, shareLinks, sharePolicy } from '../src/lib/share.mjs';

const page = 'dist/zh/sam-kamaleson-street-testimony/index.html';
const nodes = (root, match) => [ ...(match(root) ? [root] : []), ...(root.childNodes ?? []).flatMap(child => nodes(child, match)) ];
const attr = (node, key) => node?.attrs?.find(item => item.name === key)?.value;

test('share destinations encode title and canonical URL', () => {
  const url = canonicalUrl('https://reasonforhim.com/', '/zh/a-story/');
  const links = shareLinks(url, '信仰 & life?');
  const x = new URL(links.x);
  const facebook = new URL(links.facebook);
  assert.equal(x.origin + x.pathname, 'https://x.com/intent/tweet');
  assert.equal(x.searchParams.get('text'), '信仰 & life?');
  assert.equal(x.searchParams.get('url'), url);
  assert.equal(facebook.searchParams.get('u'), url);
  assert.equal([...facebook.searchParams.keys()].join(), 'u');
});

test('language, WeChat, and Web Share policies', () => {
  assert.equal(sharePolicy({ lang: 'zh', wechat: false, canShare: false, narrow: false }).primary, 'copy');
  assert.equal(sharePolicy({ lang: 'en', wechat: false, canShare: false, narrow: false }).primary, 'x');
  assert.equal(sharePolicy({ lang: 'en', wechat: false, canShare: true, narrow: true }).primary, 'native');
  assert.deepEqual(sharePolicy({ lang: 'zh', wechat: true, canShare: true, narrow: true }), { copy: true, native: false, platforms: false, primary: 'copy' });
});

test('built article uses the same canonical URL throughout, with static links and no preview or remote assets', () => {
  assert.ok(fs.existsSync(page), 'Run npm run build before this test');
  const tree = parse(fs.readFileSync(page, 'utf8'));
  const canonical = attr(nodes(tree, node => node.tagName === 'link' && attr(node, 'rel') === 'canonical')[0], 'href');
  const module = nodes(tree, node => attr(node, 'data-share-root') !== undefined).find(node => node.tagName === 'section');
  assert.ok(module);
  assert.equal(attr(module, 'data-url'), canonical);
  assert.equal(attr(nodes(tree, node => node.tagName === 'meta' && attr(node, 'property') === 'og:url')[0], 'content'), canonical);
  const links = nodes(module, node => node.tagName === 'a');
  assert.equal(new URL(attr(links.find(node => attr(node, 'data-platform') === 'x'), 'href')).searchParams.get('url'), canonical);
  assert.equal(new URL(attr(links.find(node => attr(node, 'data-platform') === 'facebook'), 'href')).searchParams.get('u'), canonical);
  assert.equal(nodes(tree, node => attr(node, 'class')?.includes('share-preview')).length, 0);
  assert.equal(nodes(module, node => ['script', 'link', 'img'].includes(node.tagName)).length, 0);
  assert.ok(nodes(tree, node => attr(node, 'data-size') !== undefined).length);
  assert.ok(nodes(tree, node => attr(node, 'data-print') !== undefined).length);
  assert.ok(nodes(tree, node => node.tagName === 'a' && attr(node, 'href') === '#reader-comments').length);
  assert.ok(nodes(tree, node => attr(node, 'data-progress-fill') !== undefined).length);
});
