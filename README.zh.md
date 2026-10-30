# 这是什么

日常写作与发布请先阅读 [博文发布指南](./博文发布指南.md)。在 ChatGPT Desktop 打开本项目，使用“准备发布”“生成预览”“批准发布”等中文指令即可。

这是一个已经配好的 Astro 双语博客骨架，包含：

- 中文（`/zh/`）与英文（`/en/`）两套完全独立的文章目录
- 自动生成的 hreflang 标签（只在你明确标注"这是互译的一对"时才生成）
- 每种语言各自的 RSS 订阅（`/zh/rss.xml`、`/en/rss.xml`）
- 语言切换导航栏

你不需要理解这些代码是怎么写的，只需要知道"写文章往哪放"和"发布前改哪里"。

---

## 写文章：你唯一需要碰的地方

所有文章都是 `.md` 文件，放在这两个文件夹里：

```
src/content/zh/   ← 中文文章放这里
src/content/en/   ← 英文文章放这里
```

新文章使用英文 kebab-case 文件名，例如 `grace-and-law.md`。中文标题写在文章信息中；文件名和网址不要使用中文或拼音。

每篇文章最上面有一段用 `---` 包起来的信息（叫 frontmatter），格式固定：

```yaml
---
title: "文章标题"
description: "一句话摘要，会出现在列表页和搜索引擎结果里"
pubDate: 2026-08-01
tags: ["护教", "神学"]
draft: false
---
```

- `pubDate` 改成实际发布日期，格式固定为 `年-月-日`
- `tags` 随便填，纯粹用来分类，以后想加"释经""讲道"都行
- `draft: true` 可以让文章先存起来但不公开发布，写完了改回 `false` 即可

`---` 下面，正常写 Markdown 就行——`# 标题`、`**加粗**`、`[链接](网址)`都能用。

## 关于双语：什么时候需要填 translationId

**大多数情况下，你不需要管这个字段，直接不填就行。**

只有当某一篇中文文章和某一篇英文文章**确实是同一篇内容的两种语言版本**时，
才在两边的 frontmatter 里加上同一个 `translationId`，比如：

```yaml
translationId: "imago-dei"
```

两边写一样的值，网站就会自动在这两个页面之间生成 hreflang 标签，告诉 Google
"这是同一篇文章的中英文版"。

如果你写的中文文章和英文文章是两个不同的选题（这是我们讨论过的推荐做法——
中英文各自针对不同的读者关切独立选题），就完全不用管这个字段，留空即可。

参考示例：
- `src/content/zh/mary-de-gao-you.md` 和 `src/content/en/new-atheism-and-old-questions.md`
  ——两篇不同选题，都没填 `translationId`
- `src/content/zh/imago-dei.md` 和 `src/content/en/imago-dei.md`
  ——真正的一对译文，两边都填了 `translationId: "imago-dei"`

---

## 域名配置（已完成，日常发布无需修改）

当前 `astro.config.mjs` 已设置：

```js
site: 'https://reasonforhim.com',
```

这个值用于网站绝对链接、RSS 和 sitemap。只有更换域名时才需要修改。

---

## 日常发布流程（回顾）

1. 在本项目聊天中提供终稿，说“准备发布，先给我预览”。
2. 助手整理文章与图片、检查并给出预览；修改到满意为止。
3. 说“批准发布这篇文章”，助手只提交本次相关文件，再推送并检查部署。
4. 以正式网页核验结果为准；Cloudflare 构建失败或仍在更新时会明确说明。

详细约定和可直接使用的例句见 [博文发布指南](./博文发布指南.md)。

---

## 目录结构速查

```
src/
├── content/
│   ├── zh/                  ← 中文文章（.md 文件）
│   └── en/                  ← 英文文章（.md 文件）
├── content.config.ts         ← 文章字段规则（一般不用碰）
├── layouts/
│   └── Layout.astro          ← 页面外壳、hreflang 逻辑（一般不用碰）
├── lib/
│   └── i18n.ts                ← 站点名称、双语配对逻辑（改站点名字在这里）
└── pages/
    ├── zh/
    │   ├── index.astro        ← 中文首页（文章列表）
    │   ├── [...slug].astro    ← 中文文章详情页模板
    │   └── rss.xml.ts         ← 中文 RSS
    └── en/                     ← 英文对应结构
```


## 首页栏目与选读封面

可在文章 frontmatter 中选填 `section`：`faith`（护教与理性）、`scripture`（圣经与神学）、`literature`（文学与想象）、`life`（见证与生活）。现有文章由 `src/lib/editorial.ts` 分类；未指定的新文章默认进入护教与理性。细标签 `tags` 继续用于文章页和搜索。

首页按日期选取最新三篇，采用一篇主推、两篇次推的布局。封面映射位于 `src/lib/editorial.ts`；同系列版画素材与生成提示词见 `docs/editorial-art.md`。
