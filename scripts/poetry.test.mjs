import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'astro';
import { parseFragment, serialize } from 'parse5';

const fixtures = new URL('./fixtures/poetry/', import.meta.url);
const articleRoutes = {
  name: 'poetry-fixtures',
  hooks: {
    'astro:config:setup': ({ injectRoute }) => {
      for (const lang of ['zh', 'en']) {
        injectRoute({
          pattern: `/${lang}/[...slug]`,
          entrypoint: new URL(`../src/pages/${lang}/[...slug].astro`, import.meta.url),
        });
      }
    },
  },
};

async function readArticle(outDir, lang, slug) {
  const html = await readFile(join(outDir, lang, slug, 'index.html'), 'utf8');
  const articleHtml = html.match(/<article class="prose[\s\S]*?<\/article>/)?.[0];
  assert.ok(articleHtml, `${lang}/${slug} must contain the rendered article body`);
  return parseFragment(articleHtml).childNodes[0];
}

function hasClass(node, className) {
  return node.attrs?.find(attr => attr.name === 'class')?.value.split(/\s+/).includes(className);
}

test('article layouts preserve poem and prose formatting', async t => {
  // Astro moves build assets with rename, so keep its output on the project volume.
  const scratch = new URL('.astro/', fixtures);
  await mkdir(scratch, { recursive: true });
  const temp = await mkdtemp(fileURLToPath(new URL('test-', scratch)));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outDir = join(temp, 'dist');
  await build({
    root: fixtures,
    srcDir: '.',
    configFile: false,
    site: 'https://example.test',
    outDir,
    cacheDir: join(temp, 'cache'),
    logLevel: 'error',
    integrations: [articleRoutes],
  });

  await t.test('poetry keeps soft line breaks, a CMS spacer, images, and a prose note', async () => {
    const article = await readArticle(outDir, 'zh', 'poem');
    assert.ok(hasClass(article, 'poetry'));
    const paragraphs = article.childNodes.filter(node => node.tagName === 'p');
    assert.deepEqual(paragraphs.slice(0, 3).map(serialize), [
      '风起于山间\n水落入溪流',
      '&nbsp;',
      '鸟鸣在树梢\n天光照前路\n旅人仍前行',
    ]);
    assert.ok(paragraphs[3]?.childNodes.some(child => child.tagName === 'img'));
    assert.equal(paragraphs.length, 4);
    const note = article.childNodes.find(node => hasClass(node, 'poetry-prose'));
    assert.equal(note?.childNodes.filter(node => node.tagName === 'p').length, 2);
  });

  await t.test('prose is the default and keeps explicit line breaks and footnotes', async () => {
    const article = await readArticle(outDir, 'en', 'prose');
    assert.ok(!hasClass(article, 'poetry'));
    const paragraph = article.childNodes.find(node => node.tagName === 'p');
    assert.ok(paragraph?.childNodes.some(child => child.tagName === 'br'));
    assert.ok(article.childNodes.some(node => hasClass(node, 'footnotes')));
  });
});
