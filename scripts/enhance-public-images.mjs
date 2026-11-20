import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { parse } from 'parse5';

const root = path.resolve(process.argv[2] || 'dist');
const imagesRoot = path.resolve('public/images');
const variants = new Map();

async function buildCandidates(imageFile, relative, width, isCover) {
  const candidates = [];
  const sizes = isCover ? new Set([400, 640, 1280].map(size => Math.min(size, width))) : [160, 320];
  for (const size of sizes) {
    if (!isCover && width <= size) {
      if (candidates.length) candidates.push({ src: `/images/${relative}`, width });
      break;
    }
    const target = `/_thumbs/${relative}-${size}.webp`;
    const file = path.join(root, target);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const dimensions = await sharp(imageFile).autoOrient().resize({ width: size }).webp({ quality: 82 }).toFile(file);
    candidates.push({ src: target, ...dimensions });
  }
  return candidates;
}

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
    const { width, height } = (await sharp(imageFile).metadata()).autoOrient;
    const updates = {};
    const isCover = 'data-essay-cover' in attrs;
    if (isCover || 'data-essay-thumbnail' in attrs) {
      const key = `${isCover ? 'cover' : 'thumbnail'}:${relative}`;
      if (!variants.has(key)) variants.set(key, await buildCandidates(imageFile, relative, width, isCover));
      const candidates = variants.get(key);
      if (candidates.length) {
        const [smallest] = candidates;
        updates.src = smallest.src;
        updates.srcset = candidates.map(({ src, width }) => `${src} ${width}w`).join(', ');
        updates.sizes = attrs[isCover ? 'data-essay-cover' : 'data-essay-thumbnail'];
        updates.width = smallest.width;
        updates.height = smallest.height;
      }
    }
    const additions = [
      !('width' in attrs) && width ? `width="${width}"` : '',
      !('height' in attrs) && height ? `height="${height}"` : '',
      !('loading' in attrs) ? `loading="${firstPublicImage ? 'eager' : 'lazy'}"` : '',
      !('decoding' in attrs) ? 'decoding="async"' : '',
    ].filter(Boolean);
    for (const [name, value] of Object.entries(updates)) {
      const attribute = `${name}="${value}"`;
      const location = node.sourceCodeLocation.attrs[name];
      if (location) edits.push({ at: location.startOffset, end: location.endOffset, text: attribute });
      else additions.push(attribute);
    }
    firstPublicImage = false;
    if (!additions.length) continue;
    const end = node.sourceCodeLocation.endOffset;
    edits.push({ at: end - 1, text: ` ${additions.join(' ')}` });
    count++;
  }
  let updated = html;
  for (const { at, end = at, text } of edits.sort((a, b) => b.at - a.at)) updated = updated.slice(0, at) + text + updated.slice(end);
  if (edits.length) await fs.writeFile(htmlFile, updated);
}
console.log(`为 ${count} 张 public/images 图片补齐加载与尺寸属性。`);
