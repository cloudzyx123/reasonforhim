# 热门排序接入与维护

线上首页和馆藏由 Cloudflare 自动注入 Web Analytics beacon。统计工作流使用单独的只读令牌查询文章浏览量。[Cloudflare Pages 的 Web Analytics](https://developers.cloudflare.com/pages/how-to/web-analytics/)

## 启用步骤

1. 在 Cloudflare 的 Web Analytics 面板确认 `reasonforhim.com` 有页面浏览记录。为该账户创建只读 API Token，选择 **Account → Account Analytics → Read**，只授权这一账户。到 GitHub 仓库的 **Settings → Secrets and variables → Actions**，将令牌存为 Secret `CLOUDFLARE_ANALYTICS_TOKEN`，将 Cloudflare Account ID 存为 Variable `CLOUDFLARE_ACCOUNT_ID`。[Cloudflare 权限说明](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
2. 在 GitHub 的 **Settings → Pages** 将 Source 设为 **GitHub Actions**。升级合并后，在 **Actions → Refresh article popularity** 从 `main` 运行一次，确认成功发布 `article-popularity.json`。这个 GitHub Pages 项目只托管统计文件。[GitHub Pages 配置](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
3. `reasonforhim.com` 默认读取 GitHub Pages 的公开统计文件。需要更换数据源时，可在构建环境设置 `PUBLIC_ARTICLE_POPULARITY_URL`。部署后在中文与英文馆藏分别检查热门选项是否可用。每种语言须有自己的有效浏览数据才会显示。

## 统计与故障处理

- 脚本先读取 `rumPageloadEventsAdaptiveGroups` 的账户限制，再按 `requestPath` 请求 `count`。时间截止至昨天开始时的 UTC 零点，为数据留出至少一天入库。优先统计 90 个完整 UTC 日。查询窗口过短时分段汇总，保留期过短时缩短统计期，页面使用实际天数。`count` 是 Cloudflare Web Analytics 的页面加载量，可受采样影响，列表仅显示顺序。浏览器读取的 JSON 含公开文章路径、汇总量和窗口元数据。[数据集限制](https://developers.cloudflare.com/analytics/graphql-api/features/discovery/settings/) · [抽样说明](https://developers.cloudflare.com/analytics/graphql-api/sampling/) · [指标说明](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/)
- 只查询 `reasonforhim.com` 下当前公开文章各自的有斜杠和无斜杠路径。英语和中文分别按实际路径计数。未返回的文章排在有量的文章之后，与明确返回零次的文章一样按日期及文章 ID 排序。脚本使用汇总量，不读取读者身份或 IP。浏览器请求静态文件时省略凭据与来源页地址。
- 工作流每周一 13:23 UTC 运行，也可从 `main` 手动刷新。收集作业仅能读取仓库，发布作业仅能部署这份统计制品。它不提交文件，也不触发 Cloudflare 正站部署。Pages CMS 保存文章走原有的部署流程。
- API 出错、响应不完整或全站没有测得浏览量时，收集作业失败，GitHub Pages 保留上次成功发布的文件。浏览器遇到无数据、读取失败或统计截止日已满 16 天时隐藏热门。直接打开 `?sort=top` 的链接会显示最新顺序及降级提示。配置好环境变量后，可用 `node scripts/update-article-popularity.mjs --check` 只读验证 API 和窗口，成功时仅输出统计期和文章路径数。
