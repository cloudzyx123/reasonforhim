import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve('public/images');
const maxBytes = 500 * 1024;
const maxWidth = 2000;

async function files(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : [file];
  }));
  return nested.flat();
}

const warnings = [];
for (const file of await files(root)) {
  if (!/\.(?:avif|gif|jpe?g|png|webp)$/i.test(file)) continue;
  const [{ size }, { width }] = await Promise.all([fs.stat(file), sharp(file).metadata()]);
  if (size <= maxBytes && (width ?? 0) <= maxWidth) continue;
  const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
  const details = [`${Math.round(size / 1024)} KiB`, width ? `${width} px wide` : ''].filter(Boolean).join(', ');
  warnings.push({ relative, details });
  console.log(`::warning file=${relative}::Large image: ${details}`);
}

console.log(`图片体积检查：${warnings.length} 张超过 500 KiB 或宽度超过 2000 px；仅提醒，不阻断构建。`);
if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = warnings.length
    ? `### Large image reminders\n\n${warnings.map(({ relative, details }) => `- \`${relative}\`: ${details}`).join('\n')}\n`
    : '### Large image reminders\n\nNo large images found.\n';
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, summary);
}
