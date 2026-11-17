import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parse } from 'parse5';

const root = path.resolve(process.argv[2] || 'dist');
const imagesRoot = path.resolve('public/images');

async function htmlFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? htmlFiles(file) : file.endsWith('.html') ? [file] : [];
  }));
  return nested.flat();
}

let count = 0;
for (const htmlFile of await htmlFiles(root)) {
  const html = await fs.readFile(htmlFile, 'utf8');
  const found = [];
  function visit(node) {
    if (node.tagName === 'img' && node.sourceCodeLocation) found.push(node);
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(html, { sourceCodeLocationInfo: true }));

  let firstPublicImage = true;
  const edits = [];
  for (const node of found) {
    const attrs = Object.fromEntries(node.attrs.map(({ name, value }) => [name, value]));
    if (!attrs.src?.startsWith('/images/')) continue;
    const relative = decodeURIComponent(attrs.src.slice('/images/'.length).split(/[?#]/, 1)[0]);
    const imageFile = path.resolve(imagesRoot, relative);
    if (!imageFile.startsWith(imagesRoot + path.sep)) throw new Error(`Invalid image path: ${attrs.src}`);
    const { width, height } = await sharp(imageFile).metadata();
    const additions = [
      !('width' in attrs) && width ? `width="${width}"` : '',
      !('height' in attrs) && height ? `height="${height}"` : '',
      !('loading' in attrs) ? `loading="${firstPublicImage ? 'eager' : 'lazy'}"` : '',
      !('decoding' in attrs) ? 'decoding="async"' : '',
    ].filter(Boolean);
    firstPublicImage = false;
    if (!additions.length) continue;
    const end = node.sourceCodeLocation.endOffset;
    edits.push({ at: end - 1, text: ` ${additions.join(' ')}` });
    count++;
  }
  let updated = html;
  for (const { at, text } of edits.reverse()) updated = updated.slice(0, at) + text + updated.slice(at);
  if (edits.length) await fs.writeFile(htmlFile, updated);
}
console.log(`为 ${count} 张 public/images 图片补齐加载与尺寸属性。`);
