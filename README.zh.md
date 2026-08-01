# 这是什么

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

新建一篇文章，复制一个现有文件改名即可，比如复制
`src/content/zh/mary-de-gao-you.md`，改名为 `恩典与律法.md`。

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

## 发布前必须改的一个地方

打开根目录的 `astro.config.mjs`，把这一行：

```js
site: 'https://example.com',
```

换成你自己买好的真实域名，比如：

```js
site: 'https://richardzhang.com',
```

这个值会被用在 hreflang 标签、RSS 订阅链接这些地方，不改的话上线后这些功能是错的。

你也可以在 `src/lib/i18n.ts` 里把 `LABELS` 对象中的
`你的博客名` / `Your Blog Name` 换成你实际的博客名称。

---

## 日常发布流程（回顾）

1. 在 `src/content/zh/` 或 `src/content/en/` 里新建/编辑 `.md` 文件
2. 本地预览：终端里运行 `npm run dev`，浏览器打开 `http://localhost:4321`
3. 确认没问题后：

   ```bash
   git add .
   git commit -m "发布新文章：文章标题"
   git push
   ```

4. Cloudflare Pages 会自动检测更新并重新构建，1-2 分钟后网站更新

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
