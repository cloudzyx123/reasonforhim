import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'parse5';
import { checkCms } from './check-pages-cms.mjs';
import { positionFootnotes } from './position-built-footnotes.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const slug = 'sam-kamaleson-street-testimony';
const source = fs.readFileSync(path.join(root, 'src/content/zh', `${slug}.md`), 'utf8');
const built = path.join(root, 'dist/zh', slug, 'index.html');

function elements(node, predicate, result = []) {
  if (node.tagName && predicate(node)) result.push(node);
  for (const child of node.childNodes ?? []) elements(child, predicate, result);
  return result;
}

function attr(node, name) {
  return node.attrs?.find(item => item.name === name)?.value;
}

test('CMS keeps footnoted articles out of the visual editor', () => {
  assert.ok(checkCms(root) > 0);
  assert.doesNotMatch(source, /\]\(#note-\d+\)/);
  for (let i = 1; i <= 4; i++) {
    assert.match(source, new RegExp(`\\[\\^${i}\\]`));
    assert.match(source, new RegExp(`^\\[\\^${i}\\]:`, 'm'));
  }
});

test('build-time placement is opt-in and supports other footnoted articles', () => {
  const section = '<section data-footnotes class="footnotes"><ol><li id="fn-a"><a href="#ref-a">↩</a></li></ol></section>';
  const html = `<article><p>正文</p><!-- footnotes-position --><p>说明</p>${section}</article>`;
  assert.equal(positionFootnotes(html), `<article><p>正文</p>${section}<p>说明</p></article>`);
  assert.equal(positionFootnotes(html.replace('<!-- footnotes-position -->', '')), html.replace('<!-- footnotes-position -->', ''));
  assert.throws(() => positionFootnotes('<article><!-- footnotes-position --></article>'), /恰好一个/);
});

test('built article links each numbered footnote in both directions', () => {
  assert.ok(fs.existsSync(built), 'Run npm run build before this test');
  const tree = parse(fs.readFileSync(built, 'utf8'));
  const ids = elements(tree, node => attr(node, 'id')).map(node => attr(node, 'id'));
  assert.equal(ids.length, new Set(ids).size, 'HTML ids must be unique');
  const footnotes = elements(tree, node => attr(node, 'data-footnotes') !== undefined);
  assert.equal(footnotes.length, 1);
  const articleText = elements(tree, node => node.tagName === 'article')[0];
  const renderedText = fs.readFileSync(built, 'utf8');
  const notesPosition = renderedText.indexOf('<section data-footnotes');
  const compilePosition = renderedText.indexOf('编译说明');
  const sourcesPosition = renderedText.indexOf('资料来源');
  assert.ok(articleText && notesPosition >= 0 && notesPosition < compilePosition && compilePosition < sourcesPosition,
    'GFM notes must appear before 编译说明 and 资料来源');
  for (let i = 1; i <= 4; i++) {
    const ref = elements(tree, node => attr(node, 'data-footnote-ref') !== undefined && attr(node, 'id') === `user-content-fnref-${i}`);
    const note = elements(footnotes[0], node => attr(node, 'id') === `user-content-fn-${i}`);
    const back = elements(note[0] ?? {}, node => attr(node, 'data-footnote-backref') !== undefined);
    assert.equal(ref.length, 1, `footnote ${i} needs one numbered reference`);
    assert.equal(attr(ref[0], 'href'), `#user-content-fn-${i}`);
    assert.equal(note.length, 1, `footnote ${i} needs one target`);
    assert.equal(back.length, 1, `footnote ${i} needs one return link`);
    assert.equal(attr(back[0], 'href'), `#user-content-fnref-${i}`);
  }
});
