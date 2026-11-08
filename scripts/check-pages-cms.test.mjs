import test from 'node:test';
import assert from 'node:assert/strict';
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
test('项目全部文章满足 CMS 规则，精排文章受保护', () => assert.ok(checkCms() > 0));
test('Markdown 脚注须使用保留源码的 CMS 编辑入口', () => {
  assert.equal(needsProtectedBody('正文[^1]\n\n[^1]: 注释'), true);
  assert.equal(needsProtectedBody('普通正文和链接'), false);
});
