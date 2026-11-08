import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parse } from 'parse5';

const page = 'dist/zh/sam-kamaleson-street-testimony/index.html';
function nodes(root, match, out = []) {
  if (match(root)) out.push(root);
  for (const child of root.childNodes ?? []) nodes(child, match, out);
  return out;
}
function attr(node, name) { return node.attrs?.find(item => item.name === name)?.value; }

test('published Chinese article without wechatUrl keeps blog sharing and SEO URLs', () => {
  assert.ok(fs.existsSync(page), 'Run npm run build before this test');
  const tree = parse(fs.readFileSync(page, 'utf8'));
  const canonical = 'https://reasonforhim.com/zh/sam-kamaleson-street-testimony/';
  assert.equal(attr(nodes(tree, node => node.tagName === 'link' && attr(node, 'rel') === 'canonical')[0], 'href'), canonical);
  assert.equal(attr(nodes(tree, node => node.tagName === 'meta' && attr(node, 'property') === 'og:url')[0], 'content'), canonical);
  assert.equal(attr(nodes(tree, node => node.tagName === 'meta' && attr(node, 'name') === 'twitter:card')[0], 'content'), 'summary_large_image');
  const actions = nodes(tree, node => attr(node, 'data-share-actions') !== undefined)[0];
  assert.ok(actions);
  assert.equal(attr(actions, 'data-url'), canonical);
  assert.ok(nodes(actions, node => node.tagName === 'img' && attr(node, 'src')?.startsWith('data:image/png;base64,')).length);
  assert.ok(nodes(actions, node => node.tagName === 'a' && attr(node, 'href')?.startsWith('https://twitter.com/intent/tweet?')).length);
  assert.ok(nodes(actions, node => node.tagName === 'a' && attr(node, 'href')?.startsWith('https://www.facebook.com/sharer/sharer.php?')).length);
  assert.equal(nodes(actions, node => attr(node, 'data-wechat-open') !== undefined).length, 0);
});
