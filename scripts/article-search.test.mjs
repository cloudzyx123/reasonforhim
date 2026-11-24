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

test('a footnote excerpt links to its rendered id and displays its list number', () => {
  const article = { ...testimony, body: '闭上眼睛，唱起了歌。', footnotes: [
    { id: 'user-content-fn-born-again', text: '你们必须重生。' },
    { id: 'user-content-fn-fool', text: '问题只在于，要做一个沉默的傻子。' },
  ] };
  const hit = searchArticle(article, searchQuery('做一个沉默的傻子'));
  assert.deepEqual(hit.footnote, { id: article.footnotes[1].id, number: 2 });
  assert.equal(hit.snippet, article.footnotes[1].text);
  assert.equal(searchArticle(article, searchQuery('闭上眼睛')).footnote, null);
  assert.ok(searchArticle(article, searchQuery('闭上眼睛 重生')));
});

function descendants(node, predicate) {
  if (predicate(node)) return [node];
  return (node.childNodes ?? []).flatMap(child => descendants(child, predicate));
}

test('short English terms use the same boundaries in fields, whole phrases and highlights', () => {
  const faith = 'Tea at Four: A Story of Ordinary Faithfulness';
  const article = { title: faith, description: faith, labels: faith, body: faith, footnotes: [] };
  for (const text of ['AI', 'ai', 'Ai', 'faith AI']) {
    assert.equal(searchArticle(article, searchQuery(text)), null);
  }
  const query = searchQuery('AI');
  const line = 'AI时代、狭义AI、（ai）、AGI、faith、OpenAI、AI2';
  assert.deepEqual([...line.matchAll(query.highlight)].map(match => match[0]), ['AI', 'AI', 'ai']);
  assert.ok(searchArticle({ ...article, body: line }, searchQuery('AI时代')));
  assert.equal(searchQuery('faith AI').phrase.test('faith aims'), false);
});

test('same-paragraph matches outrank distributed terms and the snippet shows the nearest occurrences', () => {
  const article = { title: '', labels: '', description: '', body: '狭义 AI\n通用人工智能（AGI）' };
  const query = searchQuery('AI AGI');
  const dispersed = searchArticle(article, query);
  const longParagraph = '伦诺克斯谈 AI，总是先把两种东西分开。' +
    '一套从数据里筛出模式的程序，通常只做一件原本需要人类智能的事。'.repeat(8) +
    '通用人工智能（AGI）。打个比方，如果今天的 AI 像一位只精通一门手艺的专家';
  const together = searchArticle({ ...article, body: article.body + '\n' + longParagraph }, query);
  assert.ok(together.score > dispersed.score);
  assert.ok(query.terms.every(term => term.test(together.snippet)));
  assert.ok(!together.snippet.includes('伦诺克斯谈'));
  const far = searchArticle({ ...article, body: longParagraph.replace('今天的 AI', '今天的人工智能') }, query);
  assert.ok(query.terms.every(term => term.test(far.snippet)));
  assert.ok(far.snippet.includes(' … '));
  const note = { id: 'user-content-fn-1', text: article.body };
  assert.equal(searchArticle({ ...article, body: '', footnotes: [note] }, query).score, dispersed.score);
});

test('each language index covers its published essays, including rendered paragraphs and footnotes', async () => {
  for (const lang of ['zh', 'en']) {
    const archive = await readFile(`dist/${lang}/archive/index.html`, 'utf8');
    const bodies = JSON.parse(await readFile(`dist/${lang}/search.json`, 'utf8'));
    const ids = [...archive.matchAll(/data-post="([^"]+)"/g)].map(match => match[1]);
    assert.deepEqual(Object.keys(bodies).sort(), ids.sort());
    for (const [id, { body, footnotes }] of Object.entries(bodies)) {
      const html = await readFile(`dist/${lang}/${id}/index.html`, 'utf8');
      const [prose] = descendants(parse(html), node => node.tagName === 'article' &&
        node.attrs.some(attr => attr.name === 'class' && attr.value.split(' ').includes('prose')));
      assert.ok(prose, id);
      const bodyParagraphs = new Set(body.split('\n'));
      const blocks = descendants(prose, node => node.tagName === 'p' ||
        node.attrs?.some(attr => attr.name === 'data-footnotes'));
      for (const block of blocks) {
        if (block.tagName === 'p' && block.childNodes.every(node => node.nodeName === '#text')) {
          const paragraph = block.childNodes.map(node => node.value).join('').trim().replace(/\s+/g, ' ');
          if (paragraph) assert.ok(bodyParagraphs.has(paragraph), 'Expected a separate paragraph in ' + id);
        }
      }
      const notes = descendants(prose, node => node.attrs?.some(attr => attr.name === 'data-footnotes'));
      const items = notes.flatMap(section => descendants(section, node => node.tagName === 'li'));
      assert.deepEqual(footnotes.map(note => note.id), items.map(item => item.attrs.find(attr => attr.name === 'id').value));
      for (const [section, indexedText] of [[prose, body], ...items.map((item, i) => [item, footnotes[i].text])]) {
        const paragraphs = descendants(section, node => node.tagName === 'p');
        const sample = paragraphs.flatMap(p => descendants(p, node => node.nodeName === '#text'))
          .map(node => node.value.trim().replace(/\s+/g, ' ')).find(text => text.length >= 10);
        if (sample) assert.ok(indexedText.includes(sample), `${lang}/${id}: ${sample}`);
      }
      assert.doesNotMatch(body, /<!-- footnotes-position -->|data-footnote-backref/);
    }
  }
});
