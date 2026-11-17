import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const marker = '<!-- footnotes-position -->';
const sectionPattern = /<section\s+data-footnotes\b[^>]*>[\s\S]*?<\/section>/g;

export function positionFootnotes(html) {
  if (!html.includes(marker)) return html;
  if (html.split(marker).length !== 2) throw new Error('文章只能有一个脚注位置标记');
  const sections = [...html.matchAll(sectionPattern)];
  if (sections.length !== 1) throw new Error('脚注位置标记需要恰好一个 GFM 脚注区');
  const section = sections[0][0];
  if (sections[0].index < html.indexOf(marker)) throw new Error('脚注位置标记须位于脚注区之前');
  return html.replace(section, '').replace(marker, section);
}

export function localizeChineseFootnotes(html) {
  return html.replace(sectionPattern, section => section
    .replace(/(<h2\b[^>]*id="footnote-label"[^>]*>)Footnotes(<\/h2>)/, '$1脚注$2')
    .replace(/aria-label="Back to reference (\d+)"/g, 'aria-label="返回正文脚注引用 $1"'));
}

export function positionBuiltFootnotes(directory) {
  let moved = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) moved += positionBuiltFootnotes(file);
    else if (entry.name.endsWith('.html')) {
      const before = fs.readFileSync(file, 'utf8');
      const positioned = positionFootnotes(before);
      const after = file.replaceAll('\\', '/').includes('/zh/')
        ? localizeChineseFootnotes(positioned)
        : positioned;
      if (after !== before) {
        fs.writeFileSync(file, after);
        moved++;
      }
    }
  }
  return moved;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const count = positionBuiltFootnotes(path.resolve(process.argv[2] || 'dist'));
    console.log(`已处理 ${count} 篇文章的 GFM 脚注位置或中文标签。`);
  } catch (error) {
    console.error(`脚注位置处理失败：${error.message}`);
    process.exitCode = 1;
  }
}
