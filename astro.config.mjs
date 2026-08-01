// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // 把这里换成你自己买好的域名，例如 'https://your-domain.com'
  // hreflang / sitemap / RSS 里的绝对链接都依赖这个值
  site: 'https://example.com',

  i18n: {
    locales: ['zh', 'en'],
    defaultLocale: 'zh',
    routing: {
      prefixDefaultLocale: true, // 中文也带 /zh/ 前缀，两种语言路径结构完全对称
    },
  },

  // 访问裸域名根路径时，跳转到中文首页（读者可以再用页面里的语言切换）
  redirects: {
    '/': '/zh',
  },
});
