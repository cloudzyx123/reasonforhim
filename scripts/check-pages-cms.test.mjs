import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'js-yaml';
import { checkCms, needsProtectedBody, validateArticle } from './check-pages-cms.mjs';

const article = `---\nurlName: new-article\ntitle: 标题\ndraft: true\n---\n\n<figure>图注和图片</figure>\n`;
test('有效 CMS 草稿保留原文，不改写精排正文', () => {
  const result = validateArticle('new-article.md', article);
  assert.equal(result.data.draft, true);
  assert.equal(result.body, '\n<figure>图注和图片</figure>\n');
});
test('编辑旧文的英文网址名不能悄悄改变线上路由', () => {
  assert.throws(() => validateArticle('old-article.md', article), /一致/);
  assert.throws(() => validateArticle('中文名.md', article), /kebab-case/);
});
test('草稿状态必须是布尔值', () => {
  assert.throws(() => validateArticle('new-article.md', article.replace('draft: true', 'draft: "false"')), /草稿/);
});
test('正文排版模式可省略，只接受 prose 或 poetry', () => {
  assert.equal(validateArticle('new-article.md', article).data.contentFormat, undefined);
  const withFormat = format => article.replace('draft: true', `draft: true\ncontentFormat: ${format}`);
  for (const format of ['prose', 'poetry']) {
    assert.equal(validateArticle('new-article.md', withFormat(format)).data.contentFormat, format);
  }
  assert.throws(() => validateArticle('new-article.md', withFormat('verse')), /正文排版模式/);
});
test('中英文 CMS 都可选择诗歌模式，并可直接保存 Markdown 源码', () => {
  const config = load(readFileSync(new URL('../.pages.yml', import.meta.url), 'utf8'));
  const format = config.components.article_content_format;
  assert.equal(format.default, 'prose');
  assert.deepEqual(format.options.values.map(value => value.name), ['prose', 'poetry']);
  assert.equal(config.components.visual_body.options.switcher, true);

  const collections = config.content.filter(entry => entry.type === 'collection');
  assert.deepEqual(collections.map(entry => entry.path).sort(), ['src/content/en', 'src/content/zh']);
  const formatField = { name: 'contentFormat', component: 'article_content_format' };
  for (const collection of collections) {
    assert.deepEqual(collection.fields.find(field => field.name === 'contentFormat'), formatField);
    assert.equal(collection.fields.find(field => field.name === 'body').component, 'visual_body');
  }

  const creed = config.content.find(entry => entry.name === 'modern_people_creed_article');
  const chinese = collections.find(entry => entry.path === 'src/content/zh');
  assert.ok(chinese.exclude.includes(creed.path.split('/').at(-1)));
  assert.deepEqual(creed.fields.find(field => field.name === 'contentFormat'), formatField);
  const body = creed.fields.find(field => field.name === 'body');
  assert.equal(body.type, 'code');
  assert.equal(body.options.format, 'markdown');
  assert.notEqual(body.readonly, true);
});
test('列表缩略图接受 CMS 图片，拒绝外链和路径穿越', () => {
  const addCover = image => article.replace('draft: true', `draft: true\ncoverImage: ${image}`);
  assert.equal(validateArticle('new-article.md', addCover('/images/a-cover/photo_10.avif')).data.coverImage, '/images/a-cover/photo_10.avif');
  for (const image of ['https://example.com/a.png', '//example.com/a.png', '/images/../a.png', '/images/a.svg']) {
    assert.throws(() => validateArticle('new-article.md', addCover(image)), /站内图片/);
  }
});
test('项目全部文章满足 CMS 规则，精排文章受保护', () => assert.ok(checkCms() > 0));
test('Markdown 脚注须使用保留源码的 CMS 编辑入口', () => {
  assert.equal(needsProtectedBody('正文[^1]\n\n[^1]: 注释'), true);
  assert.equal(needsProtectedBody('普通正文和链接'), false);
});
