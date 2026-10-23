import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Compose the existing editorial art with the repository's vector wordmark.
const root = new URL('../', import.meta.url);
const output = new URL('public/share/', root);
await fs.mkdir(output, { recursive: true });
const wordmark = await sharp(fileURLToPath(new URL('src/assets/share/wordmark.svg', root))).png().toBuffer();
for (const key of ['grace', 'dialogue', 'reason']) {
  const art = await sharp(fileURLToPath(new URL(`public/images/editorial/${key}.webp`, root)))
    .resize(720, 630, { fit: 'cover', position: 'centre' }).toBuffer();
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#f6f2e9' } })
    .composite([{ input: wordmark, left: 0, top: 0 }, { input: art, left: 480, top: 0 }])
    .jpeg({ quality: 90 })
    .toFile(fileURLToPath(new URL(`${key}.jpg`, output)));
}
console.log('Built three 1200 × 630 share cards.');
