#!/usr/bin/env node
/**
 * 图片优化迁移脚本
 * -----------------------------------------------------------
 * 背景:
 *   public/ 目录下的文件 Astro 构建时只会原样拷贝,不会走图片优化管线
 *   (不会转格式、不会生成 srcset、不会自动加 width/height 防止布局抖动)。
 *   要吃到 astro:assets 的优化,图片必须放进 src/ 下,并在 Markdown 正文里
 *   用相对路径引用(而不是 /images/xxx.webp 这种绝对路径)。
 *
 * 这个脚本做两件事:
 *   1. 把 public/images/<slug>/*.{webp,png,jpg,jpeg,gif,svg,avif}
 *      拷贝到 src/assets/images/<slug>/ 下(默认只拷贝,不删除原文件,更安全)
 *   2. 扫描 src/content/zh/*.md 和 src/content/en/*.md,把正文里的
 *      ![alt](/images/<slug>/xxx.ext) 改写成
 *      ![alt](../../assets/images/<slug>/xxx.ext)(相对路径由脚本自动算,
 *      不是写死的 ../../,以后目录结构变了也不会算错)
 *
 * 用法(在 quaily-migrate 目录下,PowerShell):
 *   node optimize-images.mjs --dry-run     # 先看看会改什么,不动真格
 *   node optimize-images.mjs               # 实际执行(拷贝图片 + 改写正文)
 *
 * 可选参数(一般不需要改,默认假设脚本在 quaily-migrate/ 下运行):
 *   --from-public ../public/images
 *   --to-assets   ../src/assets/images
 *   --delete-originals   # 拷贝成功后删除 public/images 里的原文件(默认不删,你自己确认没问题后再删或加这个参数重跑)
 *
 * 运行前建议:
 *   1. git status 保持干净,这样万一有问题可以直接 git checkout 撤销
 *   2. 先跑一次 --dry-run 看输出是否符合预期
 *   3. 跑完之后 npm run build,如果哪张图片路径算错了,Astro 会在构建时直接报错
 *      并告诉你是哪个文件、哪一行找不到图片
 * -----------------------------------------------------------
 */
import fs from "node:fs/promises";
import path from "node:path";

const IMAGE_EXT_RE = /\.(webp|png|jpe?g|gif|svg|avif)$/i;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    fromPublic: "../public/images",
    toAssets: "../src/assets/images",
    contentDirs: ["../src/content/zh", "../src/content/en"],
    dryRun: false,
    deleteOriginals: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--from-public") opts.fromPublic = args[++i];
    else if (a === "--to-assets") opts.toAssets = args[++i];
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--delete-originals") opts.deleteOriginals = true;
  }
  return opts;
}

// 计算「从某个 content 目录」到「图片资源目录」的相对路径,
// 用 Node 内置的 path.relative 算,不手写 ../../,避免目录深度变化时算错。
// Markdown/import 路径统一用正斜杠,不管在 Windows 上跑还是别的平台。
function computeRelativePrefix(contentDir, toAssets) {
  const rel = path.relative(contentDir, toAssets);
  return rel.split(path.sep).join("/");
}

async function moveImages(opts, stats) {
  let slugDirs;
  try {
    slugDirs = (await fs.readdir(opts.fromPublic, { withFileTypes: true })).filter((d) =>
      d.isDirectory()
    );
  } catch (err) {
    console.error(`❌ 读取 ${opts.fromPublic} 失败: ${err.message}`);
    return;
  }

  for (const dirent of slugDirs) {
    const slug = dirent.name;
    const srcDir = path.join(opts.fromPublic, slug);
    const destDir = path.join(opts.toAssets, slug);
    const files = (await fs.readdir(srcDir)).filter((f) => IMAGE_EXT_RE.test(f));

    for (const file of files) {
      const from = path.join(srcDir, file);
      const to = path.join(destDir, file);
      stats.moved++;

      if (opts.dryRun) {
        console.log(`  [dry-run] 拷贝 ${from} -> ${to}`);
        continue;
      }

      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(from, to);
      if (opts.deleteOriginals) {
        await fs.unlink(from);
      }
    }
  }
}

async function rewriteContentDir(contentDir, opts, stats) {
  const relPrefix = computeRelativePrefix(contentDir, opts.toAssets);

  let files;
  try {
    files = (await fs.readdir(contentDir)).filter((f) => f.endsWith(".md") || f.endsWith(".mdx"));
  } catch (err) {
    console.error(`❌ 读取 ${contentDir} 失败: ${err.message}`);
    return;
  }

  for (const file of files) {
    const filePath = path.join(contentDir, file);
    const raw = await fs.readFile(filePath, "utf8");

    // 只替换 ![alt](/images/...) 这种绝对路径引用,
    // 已经是相对路径或远程 http(s) 图片的引用不动。
    const rewritten = raw.replace(
      /!\[([^\]]*)\]\(\/images\/([^)\s]+)\)/g,
      (_match, alt, rest) => `![${alt}](${relPrefix}/${rest})`
    );

    if (rewritten !== raw) {
      const count = (raw.match(/!\[([^\]]*)\]\(\/images\//g) || []).length;
      stats.rewrittenFiles++;
      stats.rewrittenImages += count;

      if (opts.dryRun) {
        console.log(`  [dry-run] 将改写 ${filePath}(${count} 处图片引用,前缀 ${relPrefix}/)`);
      } else {
        await fs.writeFile(filePath, rewritten, "utf8");
        console.log(`  ✅ 已改写 ${filePath}(${count} 处图片引用)`);
      }
    }
  }
}

async function main() {
  const opts = parseArgs();
  console.log("配置:", opts, opts.dryRun ? "\n(dry-run,不会真正改动任何文件)" : "");

  const stats = { moved: 0, rewrittenFiles: 0, rewrittenImages: 0 };

  console.log(`\n第一步:拷贝图片 ${opts.fromPublic} -> ${opts.toAssets}`);
  await moveImages(opts, stats);

  for (const dir of opts.contentDirs) {
    console.log(`\n第二步:改写 ${dir} 里的图片引用`);
    await rewriteContentDir(dir, opts, stats);
  }

  console.log(
    `\n完成。拷贝图片 ${stats.moved} 个,改写 ${stats.rewrittenFiles} 个文件里共 ${stats.rewrittenImages} 处图片引用。`
  );

  if (!opts.dryRun) {
    console.log(`
下一步:
  1. npm run build —— 如果哪张图片相对路径算错了,Astro 会直接报错并指出文件和行号
  2. npm run preview —— 打开几篇文章,Ctrl+U 查看源码,确认 <img> 标签带有
     width/height/自动生成的文件名(说明确实走了优化管线,不是原样输出的旧文件)
  3. 确认没问题后,public/images/ 下的原文件就可以手动删除了
     (如果这次跑的时候没加 --delete-originals,原文件还在,可以再跑一次加上这个参数,
     或者直接在 VS Code 里手动删除 public/images 整个文件夹)
`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
