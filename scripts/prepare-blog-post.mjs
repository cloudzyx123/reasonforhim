import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { load, dump, JSON_SCHEMA } from 'js-yaml';

const root = fileURLToPath(new URL('../', import.meta.url));
const previewInputs = ['src', 'public', 'astro.config.mjs', 'tsconfig.json', 'package.json', 'package-lock.json'];
const sha = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const relative = file => path.relative(root, file).replaceAll('\\', '/');
const inside = (base, file) => {
  const rel = path.relative(base, file);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Git 信息读取失败');
  return result.stdout.trim();
}
function filesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`预览输入不接受符号链接：${file}`);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}
function checkedFile(repoPath, base = root) {
  const file = path.resolve(base, repoPath);
  if (!inside(base, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()
      || !inside(fs.realpathSync(base), fs.realpathSync(file))) {
    throw new Error(`文件不存在或超出项目：${repoPath}`);
  }
  return file;
}
export function inspect(slug, lang = 'zh', workspace = root) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('网址名须用小写英文、数字和连字符；是否为拼音仍需人工判断。');
  if (!['zh', 'en'].includes(lang)) throw new Error('语言只能为 zh 或 en');
  const article = checkedFile(`src/content/${lang}/${slug}.md`, workspace);
  const source = fs.readFileSync(article, 'utf8').replace(/^\uFEFF/, '');
  const front = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!front) throw new Error('缺少文章开头的信息区');
  const data = load(front[1], { schema: JSON_SCHEMA });
  const errors = [], warnings = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('文章信息格式错误');
  if (data.urlName !== undefined && data.urlName !== slug) errors.push('英文网址名 urlName 与文章文件名不一致');
  for (const key of ['title', 'description']) {
    if (typeof data[key] !== 'string' || !data[key].trim()) errors.push(`缺少 ${key}`);
  }
  for (const key of ['pubDate', 'updatedDate']) {
    if (key === 'updatedDate' && (data[key] == null || data[key] === '')) continue;
    const value = data[key];
    const valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
      && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (!valid) errors.push(`${key} 须为有效的 YYYY-MM-DD 日期`);
  }
  if (typeof data.draft !== 'boolean') errors.push('必须明确设置 draft: true 或 false');
  if (!['faith', 'scripture', 'literature', 'life'].includes(data.section)) errors.push('请选择有效的 section 分类');
  if (!Array.isArray(data.tags) || !data.tags.length || data.tags.some(t => typeof t !== 'string' || !t.trim())) errors.push('请填写非空 tags 标签列表');
  if (typeof data.description === 'string' && [...data.description].length > 80) warnings.push('摘要超过 80 字，建议精简');
  const body = source.slice(front[0].length);
  if (!body.trim()) errors.push('正文为空');
  if (/编者附注|TODO|待补充/.test(body)) warnings.push('正文可能含内部编辑备注，请人工检查');
  const images = [];
  for (const m of body.matchAll(/!\[([^\]]*)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+['"][^\n]*?['"])?\s*\)|<img\b[^>]*>/gi)) {
    if (m[0].startsWith('<')) {
      const src = m[0].match(/\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
      const alt = m[0].match(/\balt\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
      if (!src) errors.push('img 缺少带引号的 src');
      else images.push({ src, alt });
    } else images.push({ src: m[2] || m[3], alt: m[1] });
  }
  const assets = new Set();
  for (const image of images) {
    if (!image.alt.trim()) warnings.push(`图片缺少说明文字：${image.src}`);
    if (/^https?:\/\//i.test(image.src)) {
      warnings.push(`远程图片需要单独检查可用性和许可：${image.src}`);
      continue;
    }
    if (/^(?:data:|file:|[a-z]:|\\\\|\/\/)/i.test(image.src)) { errors.push(`图片路径不可用于网站：${image.src}`); continue; }
    try {
      const src = decodeURIComponent(image.src.split(/[?#]/)[0]);
      const file = checkedFile(src.startsWith('/') ? path.join(workspace, 'public', src.slice(1)) : path.resolve(path.dirname(article), src), workspace);
      const assetPath = path.relative(workspace, file).replaceAll('\\', '/');
      assets.add(assetPath);
      if (fs.statSync(file).size > 1.5 * 1024 * 1024) warnings.push(`图片超过 1.5 MB，建议压缩：${assetPath}`);
    } catch (error) { errors.push(error.message); }
  }
  // Common internal article links. External link availability/rights need separate review.
  for (const m of body.matchAll(/(?:href=["']|\]\()\/(zh|en)\/([a-z0-9-]+)\/?(?:[?#][^\s"')>]*)?["')]/g)) {
    if (m[2] !== 'archive' && !['md', 'mdx'].some(ext => fs.existsSync(path.join(workspace, 'src/content', m[1], `${m[2]}.${ext}`)))) errors.push(`站内文章链接不存在：/${m[1]}/${m[2]}/`);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { article, source, data, images, assets: [...assets], warnings, frontmatter: front[0] };
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--verify') {
    if (!args[1]) throw new Error('请提供先前生成的 manifest.json 路径');
    const manifest = JSON.parse(fs.readFileSync(checkedFile(args[1]), 'utf8'));
    if (!manifest.buildPassed) throw new Error('该清单尚未通过预览构建');
    if (git('rev-parse', 'HEAD') !== manifest.baseCommit) throw new Error('仓库基准已变化，请重新生成预览清单');
    const currentFiles = previewInputs.flatMap(input => {
      const file = path.join(root, input);
      return (fs.statSync(file).isDirectory() ? filesUnder(file) : [file]).map(relative);
    }).sort();
    if (JSON.stringify(currentFiles) !== JSON.stringify(Object.keys(manifest.hashes).sort())) throw new Error('预览后网站文件有增减，请重新生成预览清单');
    for (const [file, hash] of Object.entries(manifest.hashes)) {
      if (sha(checkedFile(file)) !== hash) throw new Error(`预览后文件已变化：${file}`);
    }
    console.log('版本核对通过。此结果只确认文件版本，发布授权须从作者对话中确认。');
    return;
  }
  if (!args[0] || args[0] === '--help') {
    console.log('用法：node scripts/prepare-blog-post.mjs <english-slug> [--lang zh|en] [--check-only] [--release]\n核对版本：node scripts/prepare-blog-post.mjs --verify <manifest路径>');
    return;
  }
  const slug = args[0];
  const langIndex = args.indexOf('--lang');
  if (langIndex !== -1 && !args[langIndex + 1]) throw new Error('--lang 缺少语言');
  const lang = langIndex === -1 ? 'zh' : args[langIndex + 1];
  const known = new Set(['--lang', '--check-only', '--release']);
  for (let i = 1; i < args.length; i++) {
    if (!known.has(args[i])) throw new Error(`未知参数：${args[i]}`);
    if (args[i] === '--lang') i++;
  }
  const post = inspect(slug, lang);
  if (args.includes('--release') && post.data.draft) throw new Error('正式发布检查要求 draft: false；请仅在作者批准后修改');
  console.log(`文章：${post.data.title}\n状态：${post.data.draft ? '草稿' : '公开稿'}\n配图：${post.images.length}\n正式地址：https://reasonforhim.com/${lang}/${slug}/`);
  for (const warning of post.warnings) console.log(`提醒：${warning}`);
  console.log('说明：检查覆盖文章信息、常见图片与站内文章链接；引文、版权、英语语义及外链需另行核对。');
  if (args.includes('--check-only')) return;

  const parent = path.join(root, 'output', 'blog-publish', slug);
  fs.mkdirSync(parent, { recursive: true });
  const run = fs.mkdtempSync(path.join(parent, 'run-'));
  const snapshot = path.join(run, 'preview-project');
  fs.mkdirSync(snapshot);
  const hashes = {};
  for (const input of previewInputs) {
    const source = path.join(root, input);
    for (const file of fs.statSync(source).isDirectory() ? filesUnder(source) : [source]) hashes[relative(file)] = sha(file);
    fs.cpSync(source, path.join(snapshot, input), { recursive: true });
  }
  // This directory is inside the repository: Node resolves installed dependencies
  // from ancestor node_modules without Windows junction/admin permissions.
  const snapshotArticle = path.join(snapshot, relative(post.article));
  // YAML permits indent/format variations: serialize metadata only in the preview copy.
  fs.writeFileSync(snapshotArticle, `---\n${dump({ ...post.data, draft: false })}---\n${post.source.slice(post.frontmatter.length)}`, 'utf8');
  const result = spawnSync(process.execPath, [path.join(root, 'node_modules/astro/bin/astro.mjs'), 'build', '--root', snapshot], { cwd: root, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 });
  fs.writeFileSync(path.join(run, 'build.log'), (result.stdout || '') + (result.stderr || '') + (result.error?.message || ''));
  const previewPage = path.join(snapshot, 'dist', lang, slug, 'index.html');
  const buildPassed = result.status === 0 && fs.existsSync(previewPage);
  const manifest = {
    slug, lang, title: post.data.title, generatedAt: new Date().toISOString(),
    baseCommit: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
    releaseCheck: args.includes('--release'), buildPassed,
    candidateFiles: [relative(post.article), ...post.assets], hashes,
    warnings: post.warnings, previewPage, publicUrl: `https://reasonforhim.com/${lang}/${slug}/`,
  };
  fs.writeFileSync(path.join(run, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  const report = `# 发布检查：${post.data.title}\n\n- 构建：${buildPassed ? '通过' : '失败，见 build.log'}\n- 原稿状态：${post.data.draft ? '草稿（预览仅在副本显示）' : '公开稿'}\n- 配图：${post.images.length}\n- 拟发布网址：${manifest.publicUrl}\n- 视觉检查：待浏览器检查\n- 发布批准：以作者对话为准；本报告不代表批准\n\n## 候选文件（仍须查看 Git 差异）\n\n${manifest.candidateFiles.map(file => `- ${file}`).join('\n')}\n\n## 提醒\n\n${post.warnings.map(w => `- ${w}`).join('\n') || '无自动检查提醒；仍需核对内容与图片许可。'}\n`;
  fs.writeFileSync(path.join(run, '检查报告.md'), report, 'utf8');
  console.log(`报告目录：${run}\n预览服务目录：${path.join(snapshot, 'dist')}\n可由助手使用本地静态服务打开 /${lang}/${slug}/\n没有修改原稿、Git 暂存区或远程仓库。`);
  if (!buildPassed) throw new Error(`预览构建失败：${path.join(run, 'build.log')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(`发布检查未通过：${error.message}`); process.exitCode = 1; }
}
