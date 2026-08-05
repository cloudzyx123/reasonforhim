#!/usr/bin/env node
/**
 * Quaily -> Astro 迁移脚本
 * -----------------------------------------------------------
 * 功能：
 *  1. 读取 Quaily 导出的 .md 文件（frontmatter: title/slug/datetime/summary/tags/cover_image_url）
 *  2. 转换 frontmatter 为 Astro content collection 需要的字段
 *     (title / slug / pubDate / description / tags / heroImage)
 *  3. 扫描正文中的 https://static.quail.ink/... 图片链接（以及 cover_image_url），
 *     自动下载到本地 public/images/<slug>/ 目录，并把正文和 frontmatter 里的链接替换为本地路径
 *  4. 输出到 src/content/blog/ 供 Astro 使用
 *
 * 用法：
 *   node migrate.mjs --input ./quaily-export --output ./src/content/blog --public ./public/images
 *
 * 依赖：
 *   npm install gray-matter
 *   Node >= 18 (需要内置 fetch)
 * -----------------------------------------------------------
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import matter from "gray-matter";

// ---------- 参数解析 ----------
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: "./quaily-export",
    output: "./src/content/blog",
    publicDir: "./public/images",
    imageUrlPrefix: "/images", // 正文里替换后的链接前缀，对应 public/images
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input") opts.input = args[++i];
    else if (a === "--output") opts.output = args[++i];
    else if (a === "--public") opts.publicDir = args[++i];
    else if (a === "--url-prefix") opts.imageUrlPrefix = args[++i];
    else if (a === "--dry-run") opts.dryRun = true;
  }
  return opts;
}

const IMAGE_HOST_PATTERNS = [/static\.quail\.ink/i];

function isRemoteQuailyImage(url) {
  if (!/^https?:\/\//i.test(url)) return false;
  return IMAGE_HOST_PATTERNS.some((re) => re.test(url));
}

// 从 URL 里提取一个合理的文件名，保留原始扩展名
function filenameFromUrl(url, fallbackIndex) {
  try {
    const u = new URL(url);
    const base = path.basename(u.pathname);
    if (base && base.includes(".")) return base;
  } catch {
    // ignore
  }
  return `image-${fallbackIndex}.webp`;
}

async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`下载失败 (${res.status}): ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, buf);
}

// 匹配正文里的图片链接：
//  - Markdown 语法 ![alt](url)
//  - 裸露的 <img src="url">
//  - 直接裸链接（较少见，但保险起见也处理）
function findImageUrls(content) {
  const urls = new Set();
  const mdImgRe = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/g;
  const htmlImgRe = /<img[^>]+src=["'](https?:\/\/[^"']+)["']/g;
  let m;
  while ((m = mdImgRe.exec(content))) urls.add(m[1]);
  while ((m = htmlImgRe.exec(content))) urls.add(m[1]);
  return [...urls].filter(isRemoteQuailyImage);
}

function toTagsArray(tags) {
  if (Array.isArray(tags)) return tags.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof tags === "string") {
    return tags.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function toDateOnly(datetime) {
  if (!datetime) return undefined;
  // Quaily: "2024-09-30 18:42" -> 只取日期部分 "2024-09-30"，匹配 z.coerce.date() 的推荐格式
  const normalized = String(datetime).trim().replace(" ", "T");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) {
    console.warn(`⚠️  无法解析日期: ${datetime}，将原样保留字符串`);
    return String(datetime);
  }
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

async function processFile(filePath, opts, stats) {
  const raw = await fs.readFile(filePath, "utf8");
  const { data: fm, content } = matter(raw);

  const slug = fm.slug || path.basename(filePath, path.extname(filePath));
  const imageDir = path.join(opts.publicDir, slug);
  const urlPrefixForPost = `${opts.imageUrlPrefix}/${slug}`;

  let body = content;
  const urls = findImageUrls(body);
  const allDownloads = [...urls];

  const urlMap = new Map(); // remoteUrl -> localWebPath

  let idx = 0;
  for (const url of allDownloads) {
    idx++;
    if (urlMap.has(url)) continue;
    const filename = filenameFromUrl(url, idx);
    const localFsPath = path.join(imageDir, filename);
    const localWebPath = `${urlPrefixForPost}/${filename}`;
    urlMap.set(url, localWebPath);

    if (opts.dryRun) {
      console.log(`  [dry-run] 将下载 ${url} -> ${localFsPath}`);
      continue;
    }

    if (fssync.existsSync(localFsPath)) {
      // 已下载过，跳过
      continue;
    }

    try {
      await downloadImage(url, localFsPath);
      console.log(`  ✅ 已下载: ${filename}`);
    } catch (err) {
      console.error(`  ❌ 下载失败: ${url}\n     ${err.message}`);
      stats.failedImages.push({ file: filePath, url, error: err.message });
      urlMap.delete(url); // 下载失败就不替换链接，保留原外链
    }
  }

  // 替换正文中的链接
  for (const [remote, local] of urlMap) {
    body = body.split(remote).join(local);
  }

  // 与目标 Astro schema 对齐：title / description / pubDate / tags / draft
  // (slug 不写入 frontmatter，Astro content collections 默认用文件名当 slug)
  const rawFrontmatter = {
    title: fm.title ?? "",
    description: fm.summary ?? fm.description ?? "",
    pubDate: toDateOnly(fm.datetime) ?? fm.pubDate ?? "",
    tags: toTagsArray(fm.tags),
    draft: false,
  };

  // js-yaml 不能序列化 undefined，写入前统一清理掉
  const newFrontmatter = Object.fromEntries(
    Object.entries(rawFrontmatter).filter(([, v]) => v !== undefined)
  );

  if (!newFrontmatter.title) {
    console.warn(`  ⚠️  缺少 title 字段: ${filePath}`);
  }
  if (!newFrontmatter.pubDate) {
    console.warn(`  ⚠️  缺少可解析的日期，pubDate 为空: ${filePath}`);
  }

  const outFile = matter.stringify(body, newFrontmatter);
  const outPath = path.join(opts.output, `${slug}.md`);

  if (opts.dryRun) {
    console.log(`  [dry-run] 将写入: ${outPath}`);
  } else {
    await fs.mkdir(opts.output, { recursive: true });
    await fs.writeFile(outPath, outFile, "utf8");
  }

  stats.processed++;
}

async function main() {
  const opts = parseArgs();
  console.log("配置：", opts);

  const files = (await fs.readdir(opts.input)).filter((f) => f.endsWith(".md"));
  if (files.length === 0) {
    console.error(`在 ${opts.input} 里没有找到 .md 文件`);
    process.exit(1);
  }

  const stats = { processed: 0, failedImages: [] };

  for (const f of files) {
    const fp = path.join(opts.input, f);
    console.log(`\n处理: ${f}`);
    try {
      await processFile(fp, opts, stats);
    } catch (err) {
      console.error(`❌ 处理 ${f} 失败: ${err.message}`);
    }
  }

  console.log(`\n完成。成功处理 ${stats.processed}/${files.length} 篇文章。`);
  if (stats.failedImages.length) {
    console.log(`\n⚠️ 以下图片下载失败，已保留原外链，需要手动处理：`);
    for (const f of stats.failedImages) {
      console.log(`  - [${f.file}] ${f.url} (${f.error})`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
