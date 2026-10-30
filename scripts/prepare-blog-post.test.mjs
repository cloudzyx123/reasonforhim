import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspect } from './prepare-blog-post.mjs';

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-workflow-test-'));
const article = path.join(workspace, 'src/content/zh/test-article.md');
fs.mkdirSync(path.dirname(article), { recursive: true });
fs.mkdirSync(path.join(workspace, 'public/images/test-article'), { recursive: true });
fs.writeFileSync(path.join(workspace, 'public/images/test-article/image.webp'), 'fixture');
const metadata = `---\ntitle: 测试\ndescription: 测试摘要\npubDate: '2026-10-30'\ntags: [测试]\nsection: faith\ndraft: true\n---\n\n正文。\n`;
function check(body = '', source = metadata) {
  fs.writeFileSync(article, source + body, 'utf8');
  return inspect('test-article', 'zh', workspace);
}
test('草稿和 HTML/Markdown 图片都可读取且原稿不被改变', () => {
  const post = check('![说明](/images/test-article/image.webp)\n<img src="/images/test-article/image.webp" alt="说明" />');
  assert.equal(post.data.draft, true);
  assert.equal(post.images.length, 2);
  assert.deepEqual(post.assets, ['public/images/test-article/image.webp']);
  assert.ok(fs.readFileSync(article, 'utf8').includes('draft: true'));
});
test('缺图、路径逃逸及本机图片路径都阻止准备发布', () => {
  assert.throws(() => check('![说明](/images/missing.webp)'), /不存在/);
  assert.throws(() => check('![说明](../../../../outside.webp)'), /超出项目/);
  assert.throws(() => check('<img src="C:/Users/private.png" alt="说明" />'), /不可用于网站/);
});
test('无效日期、字符串草稿和缺少分类会明确失败', () => {
  assert.throws(() => check('', metadata.replace('2026-10-30', '2026-02-30')), /有效/);
  assert.throws(() => check('', metadata.replace('draft: true', 'draft: "true"')), /draft/);
  assert.throws(() => check('', metadata.replace('section: faith', 'section: unknown')), /section/);
});
test('不支持的网址字符及不存在的站内文章链接会失败', () => {
  assert.throws(() => inspect('../escape', 'zh', workspace), /网址名/);
  assert.throws(() => check('[另文](/zh/missing-article/)'), /站内文章/);
});
test('外链图片仅提醒，不声称已检查版权和可用性', () => {
  const post = check('![说明](https://example.com/image.jpg)');
  assert.equal(post.assets.length, 0);
  assert.ok(post.warnings.some(w => w.includes('许可')));
});
test.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
