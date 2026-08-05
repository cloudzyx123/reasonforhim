#!/usr/bin/env node
/**
 * 修复脚本 v2：
 *  迁移后的文件名是 slug（不含日期），因为 Quaily 原始导出文件的 frontmatter 里
 *  自带 slug 字段，migrate.mjs 优先用了它。
 *
 *  这里反过来：拿原始 quaily-export/ 目录里的文件名（带 YYYYMMDD- 前缀）
 *  和迁移后 src/content/blog/ 里的文件按 slug 配对，把日期找回来，
 *  同时把 pubDate 为空的文章都补上，最后移动到 src/content/zh/。
 *
 * 用法（在 quaily-migrate 目录下）：
 *   node fix-migrated.mjs --originals ./quaily-export --migrated ../src/content/blog --to ../src/content/zh
 */
import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    originals: "./quaily-export",
    migrated: "../src/content/blog",
    to: "../src/content/zh",
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--originals") opts.originals = args[++i];
    else if (args[i] === "--migrated") opts.migrated = args[++i];
    else if (args[i] === "--to") opts.to = args[++i];
  }
  return opts;
}

// 从原始文件名 "20240326-how-can-you-say-only-one-true-faith.md" 里
// 拆出日期 "2024-03-26" 和去掉日期后的 slug 部分 "how-can-you-say-only-one-true-faith"
function parseOriginalFilename(filename) {
  const m = filename.match(/^(\d{4})(\d{2})(\d{2})-(.+)\.md$/);
  if (!m) return null;
  const [, y, mo, d, rest] = m;
  return { date: `${y}-${mo}-${d}`, restSlug: rest };
}

async function main() {
  const opts = parseArgs();
  await fs.mkdir(opts.to, { recursive: true });

  // 1. 建立 原始文件 slug -> 日期 的映射
  //    映射两种可能：文件名去掉日期前缀之后的部分，以及原始 frontmatter 里的 slug 字段（更可靠）
  const originalFiles = (await fs.readdir(opts.originals)).filter((f) => f.endsWith(".md"));
  const slugToDate = new Map();

  for (const f of originalFiles) {
    const parsed = parseOriginalFilename(f);
    if (!parsed) continue;

    // 用文件名剩余部分做一个候选映射
    slugToDate.set(parsed.restSlug, parsed.date);

    // 再读一次原始文件的 frontmatter.slug，做更可靠的映射（如果存在）
    try {
      const raw = await fs.readFile(path.join(opts.originals, f), "utf8");
      const { data: fm } = matter(raw);
      if (fm.slug) slugToDate.set(fm.slug, parsed.date);
    } catch {
      // 忽略单个文件读取失败，不影响整体
    }
  }

  console.log(`从 ${opts.originals} 建立了 ${slugToDate.size} 条 slug→日期 映射\n`);

  // 2. 遍历迁移后的文件，按文件名（= slug）查日期，补上 pubDate，再移动到目标目录
  const migratedFiles = (await fs.readdir(opts.migrated)).filter((f) => f.endsWith(".md"));
  let fixedCount = 0;
  let movedCount = 0;
  const stillMissing = [];

  for (const f of migratedFiles) {
    const slug = path.basename(f, ".md");
    const srcPath = path.join(opts.migrated, f);
    const raw = await fs.readFile(srcPath, "utf8");
    const { data: fm, content } = matter(raw);

    let changed = false;
    if (!fm.pubDate) {
      const dateGuess = slugToDate.get(slug);
      if (dateGuess) {
        fm.pubDate = dateGuess;
        changed = true;
        fixedCount++;
      } else {
        stillMissing.push(f);
      }
    }

    const out = matter.stringify(content, fm);
    const destPath = path.join(opts.to, f);
    const samePath = path.resolve(destPath) === path.resolve(srcPath);

    await fs.writeFile(destPath, out, "utf8");
    if (!samePath) {
      await fs.unlink(srcPath);
    }
    movedCount++;

    if (changed) console.log(`✅ 补上日期 ${fm.pubDate}: ${f}`);
    else console.log(`➡️  移动: ${f}`);
  }

  console.log(`\n完成。共处理 ${movedCount} 个文件，补上日期 ${fixedCount} 篇。`);
  if (stillMissing.length) {
    console.log(`\n⚠️ 以下文件在原始导出文件夹里找不到对应的日期前缀文件，pubDate 仍为空，需要手动补：`);
    stillMissing.forEach((f) => console.log(`  - ${f}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
