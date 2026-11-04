import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'parse5';

const root = path.resolve(process.argv[2] || 'dist');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const pages = new Map();
for (const file of walk(root).filter(file => file.endsWith('.html'))) {
  const ids = new Set(), refs = [];
  function visit(node) {
    const attrs = Object.fromEntries((node.attrs || []).map(a => [a.name, a.value]));
    if (attrs.id) ids.add(attrs.id);
    if (node.tagName === 'a' && attrs.href) refs.push(attrs.href);
    if (node.tagName === 'img' && attrs.src) refs.push(attrs.src);
    if (node.tagName === 'img' && attrs.srcset) refs.push(...attrs.srcset.split(',').map(part => part.trim().split(/\s+/)[0]).filter(Boolean));
    for (const child of node.childNodes || []) visit(child);
  }
  visit(parse(fs.readFileSync(file, 'utf8')));
  pages.set(file, { ids, refs });
}
const errors = [];
let count = 0;
for (const [file, page] of pages) {
  const route = '/' + path.relative(root, file).replaceAll('\\', '/').replace(/index\.html$/, '');
  for (const ref of page.refs) {
    let url;
    try { url = new URL(ref, `https://reasonforhim.com${route}`); } catch { errors.push(`${route}: 无效链接 ${ref}`); continue; }
    if (url.origin !== 'https://reasonforhim.com') continue;
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { errors.push(`${route}: 无效地址 ${ref}`); continue; }
    let target = path.resolve(root, `.${pathname}`);
    if (!target.startsWith(root + path.sep) && target !== root) { errors.push(`${route}: 路径超出网站 ${ref}`); continue; }
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
    count++;
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) errors.push(`${route}: 找不到 ${ref}`);
    else if (url.hash && pages.has(target) && !pages.get(target).ids.has(decodeURIComponent(url.hash.slice(1)))) errors.push(`${route}: 找不到页面位置 ${ref}`);
  }
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`站内链接和图片检查通过：${pages.size} 个页面，${count} 处引用。`);
