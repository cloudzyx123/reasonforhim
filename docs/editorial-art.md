# 书房版画封面

三张图均由内置 ImageGen 工具生成，非参考杂志转载图片。最终图片存于 public/images/editorial/，转为 1200 × 800 WebP 供首页使用，并提供 600 × 400 的 `-600.webp` 响应式版本。主题对应为恩典、思想对话、信仰与理性。

## 分享展示

`public/share/` 中的三张 1200 × 630 JPEG 分享图由现有版画与 `src/assets/share/wordmark.svg` 拼合。修改版画或品牌字样后，运行 `node scripts/build-share-images.mjs` 重新生成。文章优先使用对应封面，其余文章按栏目选择配图，映射在 `src/lib/editorial.ts`。

页面提供 Open Graph、Twitter 大图卡片、文章标题、摘要与正式网址。文章工具栏的“查看分享展示”可检查站内示意；外部平台需要网站上线后抓取这些信息，最终排版由平台决定。

## grace

文件：public/images/editorial/grace.webp

完整生成提示词：

Use case: illustration-story. Asset: landscape editorial cover for a thoughtful Christian literature and philosophy journal. Create one wide 3:2 image, no text, no lettering, no border. A hand-pulled linocut / wood engraving with delicate crosshatching, subtle handmade paper grain, restrained forest green #25483F, warm ivory #F6F2E9, muted terracotta #A75D46 and soft ochre. Refined literary magazine art, quiet, contemplative, crafted, atmospheric, generous composition; NOT photorealistic, NOT a logo, no gradients or glossy digital rendering. A small human figure viewed from behind on an ancient stone path, walking from shadow through an open arched doorway into warm dawn light. A subtle small wooden cross stands on a distant hillside beyond the arch. Olive branches frame the left edge, no other people. Theme: forgiveness, grace and the possibility of beginning again.

## dialogue

文件：public/images/editorial/dialogue.webp

完整生成提示词：

Use case: illustration-story. Asset: landscape editorial cover for a thoughtful Christian literature and philosophy journal. Create one wide 3:2 image, no text, no lettering, no border. A hand-pulled linocut / wood engraving with delicate crosshatching, subtle handmade paper grain, restrained forest green #25483F, warm ivory #F6F2E9, muted terracotta #A75D46 and soft ochre. Refined literary magazine art, quiet, contemplative, crafted, atmospheric, generous composition; NOT photorealistic, NOT a logo, no gradients or glossy digital rendering. Two empty wooden chairs face one another across a small table with an open book in an old study; a tall arched window looks onto cypress trees and a pale moon. Balanced but asymmetrical composition. Theme: philosophical dialogue, thoughtful disagreement and the search for meaning. No humans.

## reason

文件：public/images/editorial/reason.webp

完整生成提示词：

Use case: illustration-story. Asset: landscape editorial cover for a thoughtful Christian literature and philosophy journal. Create one wide 3:2 image, no text, no lettering, no border. A hand-pulled linocut / wood engraving with delicate crosshatching, subtle handmade paper grain, restrained forest green #25483F, warm ivory #F6F2E9, muted terracotta #A75D46 and soft ochre. Refined literary magazine art, quiet, contemplative, crafted, atmospheric, generous composition; NOT photorealistic, NOT a logo, no gradients or glossy digital rendering. An open old book resting on a wooden desk beside a vintage brass telescope pointing through an arched window at a night sky with delicate constellations, a distant hill and a single cypress. Quiet harmony of observation and contemplation. Theme: faith and reason, science and belief. No humans.
