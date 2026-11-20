# 首页选读与书房配图

## 如何选择首页文章

首页默认选本语言最新的公开文章。想指定一篇时，可以说“请把中文首页的书房选读换成《下午四点的茶》”。维护者在 `src/lib/editorial.ts` 的 `FEATURED_ARTICLES` 中，把 `zh` 改为 `['tea-at-four']`。英文用 `en`，两种语言可以各自选择。填多个英文文件名时采用第一篇能找到的公开文章，跳过草稿。清空为 `[]` 就恢复自动选择。其余文章按日期取最近五篇。

## 选读封面从哪里来

1. 有合适的照片、画作或专属版画时，在 CMS 的封面字段中选择图片，填写替代文字。
2. 未指定或原文件缺失时，使用本语言正文中已经核对过的图片。维护者在 `src/lib/list-covers.ts` 记录选择、画面重心和替代文字。正文移除引用后，这张图也随之退出候选。
3. 其次使用 `EDITORIAL_COVERS` 为该文指定的专属配图。专门创作的版画也可以放在这里。没有合适图片时，首页让标题和摘要独立成版。

封面与馆藏缩略图沿用同一篇文章的专属图片。首页主图保留原图的完整构图，例如邮票边纸、人物肖像及文字。构建时生成最宽 400、640、1280 像素的 WebP 候选，宽度以原图为限。列表使用 160 和 320 像素的缩略图。

## 书房的三幅品牌版画

`grace.webp`、`dialogue.webp`、`reason.webp` 分别描绘恩典、思想对话、信仰与理性。三幅作品由 ImageGen 生成，保存在 `public/images/editorial/`，各有 1200 × 800 和 600 × 400 两种尺寸。它们用于分享图和馆藏缺图时的栏目占位。首页只在“关于这间书房”使用一幅小尺寸的《思想对话》。

## 部分缩略图的来源

- 《人成为神，还是神成为人？》使用老彼得·勃鲁盖尔的《巴别塔》。[图像来源](https://commons.wikimedia.org/wiki/File:Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project.jpg)
- 《如果我是瘫子》使用詹姆斯·蒂索描绘瘫子从屋顶被放下的画作。[布鲁克林博物馆](https://opencollection.brooklynmuseum.org/objects/4504)
- 《以色列邮票：2700年前的盼望》使用正文内作者收藏的三枚 1962 年邮票照片。[邮票资料](https://commons.wikimedia.org/wiki/Category:1962_stamps_of_Israel_-_Mo%27adim_Lesimkha_series)
- 《劳伦斯：一位死于讲笑话的殉道者》使用弗拉·安杰利科《瓦勒良面前的劳伦斯》的壁画局部。[图像来源](https://commons.wikimedia.org/wiki/File:Lawrence-before-Valerianus.jpg)
- 萨姆·卡马莱森见证的中英文版使用弗兰克·邦德拍摄的 1945 年马德拉斯历史街景。[图像来源](https://commons.wikimedia.org/wiki/File:A_Madras_Street_Scene_(BOND_0414).jpg)
- 《基督教缔造的六个现代观念》使用卡拉瓦乔的《多马的怀疑》。[图像来源](https://commons.wikimedia.org/wiki/File:Caravaggio_incredulity.jpg)
- 《下午四点的茶》的中英文版各用本篇正文里的茶具插图。

《一个孩子问：如果我的父母不信耶稣，能去天堂吗？》《自由之恩典》和《对童话的三种异议》新增的馆藏画作同时用于正文和列表，来源和公有领域状态见相应文章的图注。《一封沉痛的挽回书信》使用栏目版画，书信仍以原文开场。

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
