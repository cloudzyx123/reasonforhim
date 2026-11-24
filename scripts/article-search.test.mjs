import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parse } from 'parse5';
import { searchArticle, searchQuery } from '../src/lib/article-search.mjs';

// Excerpts from the published Kamaleson essay. Keep the regression independent
// of future editorial changes, then check the actual build separately below.
const testimony = {
  title: '他最怕被当成傻子，却在垃圾箱旁唱起了歌',
  description: '一次出人意料的顺服，却改变了他的一生。',
  labels: '街头布道 · 福音 · 信仰与生活',
  body: '在印度马德拉斯（今金奈）一条熙熙攘攘的街上，有一天，我走在普拉赛瓦卡姆（Purasawalkam）的闹市区。要做一个沉默的傻子',
};

test('literal Chinese phrases, case-insensitive English and mixed terms return readable excerpts', () => {
  for (const phrase of ['熙熙攘攘的街上', 'pURAsawalkam', '普拉赛瓦卡姆Purasawalkam', '金奈 PURASAWALKAM', '做一个沉默的傻子']) {
    const query = searchQuery(phrase);
    const hit = searchArticle(testimony, query);
    assert.ok(hit);
    assert.ok(query.terms.every(term => term.test(hit.snippet)));
  }
  for (const phrase of ['熙熙街上', '金奈 qzxv987', '.*']) {
    assert.equal(searchArticle(testimony, searchQuery(phrase)), null);
  }
  assert.equal(searchQuery('  '), null);
});

test('title matches outrank body matches and each metadata field contributes', () => {
  const query = searchQuery('傻子');
  assert.ok(searchArticle(testimony, query).score > searchArticle({ ...testimony, title: '' }, query).score);
  for (const phrase of ['垃圾箱旁', '出人意料的顺服', '街头布道', '信仰与生活']) {
    const hit = searchArticle(testimony, searchQuery(phrase));
    assert.ok(hit);
    assert.ok(testimony.title.includes(phrase) || hit.snippet.includes(phrase));
  }
});

function descendants(node, predicate) {
  if (predicate(node)) return [node];
  return (node.childNodes ?? []).flatMap(child => descendants(child, predicate));
}

test('each language index covers its published essays, including rendered paragraphs and footnotes', async () => {
  for (const lang of ['zh', 'en']) {
    const archive = await readFile(`dist/${lang}/archive/index.html`, 'utf8');
    const bodies = JSON.parse(await readFile(`dist/${lang}/search.json`, 'utf8'));
    const ids = [...archive.matchAll(/data-post="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(Object.keys(bodies).sort(), ids.sort());
    for (const [id, body] of Object.entries(bodies)) {
      const html = await readFile(`dist/${lang}/${id}/index.html`, 'utf8');
      const [prose] = descendants(parse(html), node => node.tagName === 'article' &&
        node.attrs.some(attr => attr.name === 'class' && attr.value.split(' ').includes('prose')));
      assert.ok(prose, id);
      const notes = descendants(prose, node => node.attrs?.some(attr => attr.name === 'data-footnotes'));
      for (const section of [prose, ...notes]) {
        const paragraphs = descendants(section, node => node.tagName === 'p');
        const sample = paragraphs.flatMap(p => descendants(p, node => node.nodeName === '#text'))
          .map(node => node.value.trim().replace(/\s+/g, ' ')).find(text => text.length >= 10);
        if (sample) assert.ok(body.includes(sample), `${lang}/${id}: ${sample}`);
      }
      assert.doesNotMatch(body, /<!-- footnotes-position -->|data-footnote-backref/);
    }
  }
});
