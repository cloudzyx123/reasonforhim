import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load, JSON_SCHEMA } from 'js-yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function validateArticle(file, source) {
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) throw new Error(`${file}：缺少文章信息`);
  const data = load(front[1], { schema: JSON_SCHEMA });
  const name = path.basename(file, path.extname(file));
  if (!slugPattern.test(name)) throw new Error(`${file}：文件名必须使用英文 kebab-case`);
  if (data?.urlName !== name) throw new Error(`${file}：英文网址名 urlName 须与文件名 ${name} 一致。已发布文章请保留原网址名。`);
  if (typeof data.draft !== 'boolean') throw new Error(`${file}：请明确设置草稿开关 draft`);
  return { data, body: source.slice(front[0].length) };
}

export function needsProtectedBody(body) {
  return /<(?:figure|iframe|table)\b/i.test(body) || /\[\^[^\]\r\n]+\]/.test(body);
}

export function checkCms(workspace = root) {
  const config = load(fs.readFileSync(path.join(workspace, '.pages.yml'), 'utf8'));
  if (config.settings?.content?.merge !== true) throw new Error('CMS 必须保留未管理字段：settings.content.merge: true');
  const components = config.components;
  if (components.article_draft.default !== true) throw new Error('CMS 新文章必须默认草稿');
  if (components.visual_body.options.format !== 'markdown') throw new Error('正文须保存为 Markdown');
  if (config.media[0].input !== 'public/images' || config.media[0].output !== '/images') throw new Error('图片保存目录与公开网址不匹配');
  const entries = config.content;
  for (const entry of entries) {
    if (entry.operations?.rename !== false || entry.operations?.delete !== false) throw new Error(`${entry.name}：请保留文章改名/删除保护`);
    if (entry.type === 'collection' && (entry.filename.template !== '{fields.urlName}.md' || entry.filename.field !== false)) throw new Error('新文件名必须由英文网址名生成');
    for (const field of entry.fields) {
      if (field.name === 'slug') throw new Error('勿使用 Astro 的保留 slug 字段覆盖实际路由');
      if (field.component && !components[field.component]) throw new Error(`缺少字段组件 ${field.component}`);
    }
  }
  let count = 0;
  for (const lang of ['zh', 'en']) {
    const dir = path.join(workspace, 'src/content', lang);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(name => /\.mdx?$/.test(name))) {
      const articlePath = `src/content/${lang}/${file}`;
      const article = validateArticle(file, fs.readFileSync(path.join(dir, file), 'utf8'));
      if (/\]\(#note-\d+\)/.test(article.body)) throw new Error(`${articlePath}：手写脚注链接易与渲染锚点失配，请使用 Markdown [^1] 脚注`);
      if (needsProtectedBody(article.body)) {
        const protectedEntry = entries.find(entry => entry.type === 'file' && entry.path === articlePath);
        const field = protectedEntry?.fields.find(field => field.name === 'body');
        const hasFootnotes = /\[\^[^\]\r\n]+\]/.test(article.body);
        const hasFineHtml = /<(?:figure|iframe|table)\b/i.test(article.body);
        if (field?.type !== 'code' || field.options?.format !== 'markdown' || (hasFineHtml && !field.readonly)) {
          throw new Error(`${articlePath}：含脚注或精排 HTML，须配置独立 Markdown 代码正文入口；精排 HTML 须只读`);
        }
        const collection = entries.find(entry => entry.path === `src/content/${lang}`);
        if (!collection?.exclude?.includes(file)) throw new Error(`${articlePath}：须从可视化编辑列表排除`);
      }
      count++;
    }
  }
  return count;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(`Pages CMS 配置与 ${checkCms()} 篇文章检查通过。`); }
  catch (error) { console.error(`CMS 检查未通过：${error.message}`); process.exitCode = 1; }
}
