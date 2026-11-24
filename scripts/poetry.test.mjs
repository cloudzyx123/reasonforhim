import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFragment } from 'parse5';

const creed = 'satirical-poem-modern-people-creed-steve-turner';

function readArticle(lang, slug) {
  const html = readFileSync(new URL(`../dist/${lang}/${slug}/index.html`, import.meta.url), 'utf8');
  const articleHtml = html.match(/<article class="prose[\s\S]*?<\/article>/)?.[0];
  assert.ok(articleHtml, 'The built page must contain the article body');
  return parseFragment(articleHtml).childNodes[0];
}

function hasClass(node, className) {
  return node.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/).includes(className);
}

test('Creed preserves soft line breaks and one paragraph per existing stanza', () => {
  const article = readArticle('zh', creed);
  assert.ok(hasClass(article, 'poetry'));
  const paragraphs = article.childNodes.filter(node => node.tagName === 'p');
  const firstStanza = paragraphs.findIndex(node => node.childNodes[0]?.value?.startsWith('我们信仰马克思'));
  assert.ok(firstStanza >= 0);

  const stanzas = paragraphs.slice(firstStanza, firstStanza + 15);
  assert.deepEqual(stanzas.map(node => node.childNodes[0].value.split('\n').length), [
    5, 5, 4, 6, 5, 7, 4, 4, 5, 7, 2,
    1, // Heading of the postscript, kept as authored.
    4, 5, 2,
  ]);
  const note = article.childNodes.find(node => hasClass(node, 'poetry-prose'));
  assert.equal(note?.childNodes.filter(node => node.tagName === 'p').length, 2);
  assert.equal(paragraphs.filter(node => node.childNodes.some(child => child.tagName === 'img')).length, 2);
});

test('older prose and the existing English hard breaks retain their rendering', () => {
  const article = readArticle('zh', 'sam-kamaleson-street-testimony');
  assert.ok(!hasClass(article, 'poetry'));
  assert.ok(article.childNodes.some(node => hasClass(node, 'footnotes')));

  const english = readArticle('en', creed);
  assert.ok(!hasClass(english, 'poetry'));
  assert.ok(english.childNodes.some(node => node.tagName === 'p' && node.childNodes.some(child => child.tagName === 'br')));
});
