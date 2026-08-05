#!/usr/bin/env node
/**
 * 批量填充文章 description 字段
 * -----------------------------------------------------------
 * 用途：
 *   把下面 DESCRIPTIONS 对照表里确认好的 description，写入对应文章的 frontmatter。
 *
 * 安全机制：
 *   - 只有当文章当前 description 为空（"" 或 ''）时才会写入；
 *     如果已经有内容，默认跳过并在日志里提示，不会覆盖你手动改过的内容
 *     （除非显式加 --force）。
 *   - 默认支持 --dry-run，先预览会改动哪些文件，不实际写入。
 *
 * 用法（在 quaily-migrate/ 目录下运行，PowerShell）：
 *   node fill-descriptions.mjs --dry-run     # 先预览，确认没问题
 *   node fill-descriptions.mjs               # 实际写入
 *   node fill-descriptions.mjs --force       # 连已有内容的也覆盖（谨慎使用）
 *
 * 依赖：无第三方依赖，纯 Node.js 内置模块（fs / path）。
 * -----------------------------------------------------------
 */

import fs from "node:fs";
import path from "node:path";

// ---------- 1. "文件名 -> description" 对照表 ----------
// 文件名不带路径，脚本会自动去 src/content/zh 和 src/content/en 两个目录里查找。
// 注：george_mcdonald.md 是 neglected-fairy-tale-master-and-removed-easter-eggs.md
// 的重复旧版本，已按你的决定排除在外，不在这份表里，脚本也不会碰它。
const DESCRIPTIONS = {
  "a-kid-asks-if-my-parents-dont-believe-in-jesus-can-they-go-to-heaven.md":
    "从一个初中生的提问出发，探讨\"未信主的父母能否得救\"，阐明天堂与地狱的本质，以及神的爱如何尊重人的自由选择。",
  "a-painful-letter-of-recovery-rethinking-church-liberalization-and-lgbt-movement.md":
    "一封致教会的公开信，反思宗派在性伦理议题上的自由化转向，重申圣经对婚姻与圣洁的教导。",
  "augustine-confessions-astrology-confusion-three-modern-versions.md":
    "借奥古斯丁对占星术的反思，剖析达尔文主义、马克思主义与弗洛伊德主义如何延续\"洗脱人的罪责\"这一古老诱惑。",
  "chapter-1-your-kingdom-come.md":
    "《子里的选民》第一章，探讨神的主权如何在动荡时代中托住信徒，历史朝着\"你的国降临\"这一既定终局前行。",
  "chapter-3-price-of-the-masses.md":
    "《子里的选民》第三章，从人的罪与神人间独一中保基督入手，阐述基督为万人舍己作赎价的教义。",
  "christmas-true-meaning-incarnation-thoughts-through-the-ages.md":
    "借历代神学家与讲道者的默想文字，重新思考圣诞节的真义——道成肉身的降卑与荣耀。",
  "confidence-behind-rationality-science-atheism-faith-issue.md":
    "约翰·伦诺克斯（中英对照）反思\"科学不需要信心\"这一流行说法，指出理性与无神论同样无法摆脱信仰问题。",
  "free-grace.md":
    "探讨保罗所传\"自由恩典\"福音的三层含义：出于神的主权、借信心白白领受、使人从内在辖制中得释放。",
  "god-is-dead-chesterton-vs-nietzsche.md":
    "整理\"上帝已死：切斯特顿 vs. 尼采\"节目内容，呈现切斯特顿如何以常识拆解尼采的虚无主义逻辑。",
  "how-can-you-say-only-one-true-faith.md":
    "借一位伊朗归信者的故事与乳腺癌诊断的类比，回应\"你怎能说只有一个真信仰\"这一常见质疑。",
  "if-i-were-paralyzed-a-poems-gospel-reflection.md":
    "一首以《马可福音》瘫子蒙赦罪故事为灵感的诗歌，默想神赦罪之恩如何临到不能自救的人（附中英对照）。",
  "laurence-a-martyr-died-from-telling-jokes.md":
    "纪念三世纪殉道者劳伦斯，讲述他把穷人瘸子盲人呈给罗马皇帝、称他们为\"教会的宝藏\"的故事。",
  "lewis-and-tolkien-debate-myths-and-lies.md":
    "重现1931年托尔金与C.S.路易斯那场促成路易斯归信的著名夜谈，探讨神话究竟是谎言还是承载真理的载体。",
  "neglected-fairy-tale-master-and-removed-easter-eggs.md":
    "介绍被忽视的童话大师乔治·麦克唐纳，及精读《公主与哥布林》原著时发现的两个版本间的删改\"彩蛋\"。",
  "satirical-poem-modern-people-creed-steve-turner.md":
    "史蒂夫·特纳讽刺诗《（现代人的）信条》中译，以反讽笔法揭露相对主义与实用主义的自相矛盾。",
  "six-modern-concepts-created-by-christianity.md":
    "梳理基督教如何塑造了\"世界有规律\"\"个人有自由\"等六项现代世界观的核心观念。",
  "three-objections-to-fairy-tales-and-cs-lewiss-response.md":
    "整理C.S.路易斯对\"童话故事不适合儿童\"这一常见异议的三点回应，为童话文学正名。",
  "who-can-give-peace-to-betrayers-cannibals-and-murderers.md":
    "讲述宣教士在巴布亚沙威部落（以背叛为乐、曾有食人习俗）中传福音的故事，及\"和平之子\"如何触动他们的心。",
  "why-the-bible-descriptions-of-heaven-are-superficial.md":
    "回应\"圣经对天国的描写为何如此肤浅\"的提问，说明这是神体恤人有限的理性、俯就人所能理解的语言。",
  "yang-xiaokai-3-processes-of-knowing-christianity.md":
    "华人经济学家杨小凯的信仰见证，回顾他从监狱经历到理性主义反思，最终认识基督教的三个阶段。",
  "zi-li-xuan-min-chapter-2.md":
    "《子里的选民》第二章，翻译罗伯特·香客对拣选与预定论的探讨，呈现神愿万人得救这一立场下的圣经论证。",
};

// ---------- 2. 内容目录（相对本脚本所在位置 quaily-migrate/ 而言） ----------
const CONTENT_DIRS = [
  path.join("..", "src", "content", "zh"),
  path.join("..", "src", "content", "en"),
];

// ---------- 3. 命令行参数 ----------
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force");

// ---------- 4. YAML 双引号字符串安全转义 ----------
function toYamlDoubleQuoted(str) {
  const escaped = str.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

// ---------- 5. 在 frontmatter 里定位并替换 description 行 ----------
function updateDescription(raw, newDescription) {
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { ok: false, reason: "找不到 frontmatter（--- ... ---）区块" };
  }
  const [, frontmatter, body] = fmMatch;

  const descLineRe = /^description:\s*(.*)$/m;
  const descMatch = frontmatter.match(descLineRe);

  if (!descMatch) {
    return { ok: false, reason: "frontmatter 里没有 description 字段，需要手动检查" };
  }

  const currentValue = descMatch[1].trim();
  const isEmpty = currentValue === '""' || currentValue === "''" || currentValue === "";

  if (!isEmpty && !force) {
    return { ok: false, reason: `已有内容，跳过（当前值：${currentValue}）` };
  }

  const newLine = `description: ${toYamlDoubleQuoted(newDescription)}`;
  const newFrontmatter = frontmatter.replace(descLineRe, newLine);
  const newRaw = `---\n${newFrontmatter}\n---\n${body}`;

  return { ok: true, newRaw };
}

// ---------- 6. 主流程 ----------
function findFile(filename) {
  for (const dir of CONTENT_DIRS) {
    const fullPath = path.join(dir, filename);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}

let updated = 0, skipped = 0, notFound = 0;

console.log(dryRun ? "=== DRY RUN（预览模式，不会实际写入）===\n" : "=== 正式写入模式 ===\n");

for (const [filename, description] of Object.entries(DESCRIPTIONS)) {
  const filePath = findFile(filename);
  if (!filePath) {
    console.log(`❓ 未找到文件: ${filename}`);
    notFound++;
    continue;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const result = updateDescription(raw, description);

  if (!result.ok) {
    console.log(`⏭️  跳过 ${filename}: ${result.reason}`);
    skipped++;
    continue;
  }

  if (dryRun) {
    console.log(`✅ [dry-run] 将更新: ${filename}`);
  } else {
    fs.writeFileSync(filePath, result.newRaw, "utf8");
    console.log(`✅ 已更新: ${filename}`);
  }
  updated++;
}

console.log(`\n完成。更新 ${updated} 篇，跳过 ${skipped} 篇，未找到 ${notFound} 篇。`);
if (dryRun) {
  console.log("这是 dry-run 预览，没有实际写入任何文件。确认输出无误后，去掉 --dry-run 参数重新运行即可真正写入。");
}
