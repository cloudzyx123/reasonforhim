import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'parse5';

const page = path => parse(readFileSync(`dist/${path}/index.html`, 'utf8'));
const attr = (node, key) => node?.attrs?.find(item => item.name === key)?.value;

function find(root, match) {
  if (match(root)) return root;
  for (const child of root.childNodes ?? []) {
    const result = find(child, match);
    if (result) return result;
  }
}

const guide = page('subscribe');
for (const [lang, anchor] of [['zh', 'home-screen'], ['en', 'home-screen-en']]) {
  test(`${lang} guide is reachable from the home page and article footer`, () => {
    const home = page(lang);
    const article = page(`${lang}/sam-kamaleson-street-testimony`);
    const areas = [
      find(home, node => attr(node, 'id') === 'about'),
      find(home, node => node.tagName === 'footer'),
      find(article, node => node.tagName === 'footer'),
    ];
    for (const area of areas) {
      assert.ok(find(area, node => node.tagName === 'a' && attr(node, 'href') === `/subscribe/#${anchor}`));
    }
  });

  test(`${lang} guide renders collapsed with a separate home-page link`, () => {
    const section = find(guide, node => attr(node, 'id') === anchor);
    if (lang === 'en') assert.equal(attr(section, 'lang'), 'en');
    const panel = section.childNodes.find(node => node.tagName === 'details');
    assert.ok(panel);
    assert.equal(attr(panel, 'open'), undefined);
    const link = find(panel, node => node.tagName === 'a' && attr(node, 'href') === `/${lang}/`);
    assert.equal(attr(link, 'target'), '_blank');
  });
}

test('declared touch icon is a 180px square PNG', () => {
  const icon = find(guide, node => node.tagName === 'link' && attr(node, 'rel') === 'apple-touch-icon');
  const bytes = readFileSync('dist' + attr(icon, 'href'));
  assert.equal(bytes.toString('hex', 0, 8), '89504e470d0a1a0a');
  assert.deepEqual([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], [180, 180]);
});
