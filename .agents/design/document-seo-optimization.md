# FastGPT 文档站（doc.fastgpt.cn / doc.fastgpt.io）SEO 优化方案

## 1. 背景与目标

FastGPT 官网 `fastgpt.cn` 与 `fastgpt.io` 已采用独立域名承载各自默认语言并去除主语言路径前缀的架构。文档站 `doc.fastgpt.cn` 与 `doc.fastgpt.io` 对齐官网多语言与域名归属策略，建立单域名单主语言、无语言前缀的规范 URL 体系，消除重定向链与跨语言收录干扰，并完善双语动态 `hreflang`、结构化数据、Markdown/LLMs 导出及跨仓链接一致性。

## 2. 站点变体与域名语言归属

通过 `DOCS_SITE_VARIANT`（及前端可读 `NEXT_PUBLIC_DOCS_SITE_VARIANT`）显式区分三类运行变体：

| 变体 | 域名 | 归属语言 | 规范路径形态 | 索引策略 |
| --- | --- | --- | --- | --- |
| `cn` | `https://doc.fastgpt.cn` | `zh-CN` | `/<slug>`（无语言前缀） | 允许索引，输出 `robots.txt` 与 `sitemap.xml` |
| `io` | `https://doc.fastgpt.io` | `en` | `/<slug>`（无语言前缀） | 允许索引，输出 `robots.txt` 与 `sitemap.xml` |
| `preview` | PR 预览与本地默认开发 | `zh-CN`、`en` | `/zh-CN/<slug>`、`/en/<slug>` | 全站 `noindex, nofollow`，`robots.txt` 禁止抓取 |

变体解析优先级：
1. 读取 `NEXT_PUBLIC_DOCS_SITE_VARIANT` 或 `DOCS_SITE_VARIANT`（支持 `cn`、`io`、`preview`）。
2. 单独配置 `NEXT_PUBLIC_FASTGPT_HOME_DOMAIN` 或 `FASTGPT_HOME_DOMAIN` 时，按 `.cn` 后缀映射为 `cn`，其余域名映射为 `io`。
3. 本地缺省环境变量时默认采用 `preview`，支持单实例双语开发调试。

## 3. URL 路由、重写与单跳 301 重定向策略

### 3.1 生产环境（`cn` / `io` 归属模式）
- **无前缀直出渲染**：访问 `https://doc.fastgpt.cn/guide/getting-started` 或 `https://doc.fastgpt.io/guide/getting-started` 时，中间件在内部重写至 `/[lang]/(docs)/[...slug]` 对应归属语言路由，直接返回 HTTP `200`，附带 `Content-Language`、`Vary: Accept` 与 `Cache-Control: public, max-age=0, must-revalidate`，匿名请求保持零 `Set-Cookie`。
- **同站历史语言前缀收敛**：`https://doc.fastgpt.cn/zh-CN/<slug>` 单跳 `301` 至 `https://doc.fastgpt.cn/<slug>`；`https://doc.fastgpt.io/en/<slug>` 单跳 `301` 至 `https://doc.fastgpt.io/<slug>`，完整保留 Query 参数。
- **同站未知路径直返 `404`**：当归属语言前缀路径或 `/docs/*` 在同站解析后无已发布 MDX 页面对应时，直接内部重写交由 Next.js 返回单跳 `404`（`noindex`），消除 `301 -> 404` 跳转链。
- **跨站语言前缀分流**：`https://doc.fastgpt.cn/en/<slug>` 单跳 `301` 至 `https://doc.fastgpt.io/<slug>`；`https://doc.fastgpt.io/zh-CN/<slug>` 单跳 `301` 至 `https://doc.fastgpt.cn/<slug>`。
- **历史路径与旧域名一步到位**：根路径 `/`、`/docs/*`、历史迁移目录、大小写修正以及旧域名 `doc.fastgpt.in` / `doc.tryfastgpt.ai`（含 `/robots.txt`、`/sitemap.xml`、`/llms*.txt`、`/pricing.md`、`/static.json` 根发现入口）均直接单跳 `301` 至对应归属域名的无前缀最终规范 URL；已下线案例维持 HTTP `410 Gone` 与 `X-Robots-Tag: noindex`。
- **单页 Markdown 与 LLMs 路径收敛**：`/<slug>.md` 与 `Accept: text/markdown` 直接重写至对应归属语言 Markdown 接口，输出完整规范域名内链、`Last-Modified` / `Last Updated` 时间戳及归档页 `X-Robots-Tag: noindex`；`/{lang}/<slug>.md` 与 `/{lang}/llms*.txt` 单跳 `301` 至归属域名无前缀地址；`/pricing.md` 同时覆盖商业版与官方云服务套餐（CNY ¥）明细表。

### 3.2 预览环境（`preview` 模式）
- 保留 `/zh-CN/<slug>` 与 `/en/<slug>` 双语路径同容器预览体验。
- 所有页面响应头附加 `X-Robots-Tag: noindex, nofollow`，HTML metadata 输出 `robots: { index: false, follow: false }`，`robots.txt` 返回 `Disallow: /`，`sitemap.xml` 返回空 `<urlset>`。

## 4. 多语言发现、元数据、结构化数据与内链治理

1. **按页动态 `hreflang` 与 `sitemap.xml`**：
   - 通过 `hasPublishedLocalePage` 校验物理 MDX 文件存在性、语言后缀匹配、已发布状态与活跃标记。
   - 仅对实际发布的语言版本输出 `<link rel="alternate" hreflang="zh-CN" href="https://doc.fastgpt.cn/<slug>" />`、`<link rel="alternate" hreflang="en" href="https://doc.fastgpt.io/<slug>" />` 与 `hreflang="x-default"`（指向英文规范页），`sitemap.xml` 中的 `<loc>` 与 `xhtml:link` 同步使用无前缀规范 URL。
2. **构建范围与站内搜索隔离**：
   - `source.generateParams`、`app/[lang]/layout.tsx`、`app/[lang]/llms*.txt/route.ts`、`app/static.json/route.ts` 与 `app/api/search/route.ts` 按 `getPublishedDocsLocales()` 过滤，生产镜像仅预渲染并索引自身归属语言。
3. **Title、JSON-LD 与站点验证标签**：
   - 为文档首页补充高意图 `seoTitle`，当页面标题已含 `FastGPT` 时使用绝对标题输出，保持品牌词单次出现。
   - `generateWebSiteSchema` 与 `generateArticleSchema` 将 `Organization.@id` 对齐主站实体（`https://fastgpt.cn/#organization` / `https://fastgpt.io/#organization`），`BreadcrumbList` 以主站根域名为首节点并完整保留中间无索引目录层级，保证所有页面至少包含 2 个层级项。
   - `app/[lang]/layout.tsx`、`Dockerfile` 与 `.github/workflows/build-docs.yml` 贯通 Google、Bing（`msvalidate.01`）与百度站长验证标签构建参数。
4. **组件内链、语言切换器与主站外链对齐**：
   - `LocalizedLink`、`mdx-components.tsx` 中的 `Card`、`generateToc.js` 与 `remarkCleanLlmsMdx` 自动将内部链接规范化为当前环境无前缀（或预览前缀）200 地址。
   - `LanguageSwitcher` 直接渲染可见的可抓取 `<a href hrefLang lang>` 语言切换按钮，并附带基于浏览器语言偏好的轻量可关闭语言切换提示条。
   - 文档内指向官网的价格与商务咨询链接统一通过 `buildFastGPTWebsiteUrl` 生成 `fastgpt.cn` / `fastgpt.io` 无前缀规范地址；`FastGPT` 主仓（`getDocPath`、默认系统配置、README、国际化文案）与 `fastgpt-home` 仓库内指向文档站的入口链接同步收敛为无前缀规范路由。
   - 在 `.github/workflows/build-docs.yml` 与 `.github/workflows/preview-docs-build.yml` 中注入 `DOCS_SITE_VARIANT` 构建参数，保持源文档跨站链接语义一致。

## 5. TODO 清单

- [x] 1. 在 `document/lib/docs-locale.js`、`document/lib/fastgpt-home-url.ts`、`document/lib/i18n.ts`、`document/lib/localized-navigation.ts` 与 `document/lib/source.ts` 实现站点变体解析、无前缀路径工具与归属语言过滤
- [x] 2. 升级 `document/middleware.ts` 实现生产无前缀重写、同站/跨站单跳 `301`、`Content-Language` 与预览 `noindex`
- [x] 3. 更新 `document/app/robots.txt/route.ts`、`document/app/sitemap.xml/route.ts`、`document/app/static.json/route.ts`、`document/app/api/search/route.ts`、`document/app/pricing.md/route.ts`、`document/app/[lang]/llms*.txt/route.ts`、`document/lib/llms-markdown.ts` 与 `document/lib/schema.ts`
- [x] 4. 更新文档内容、目录生成与英文链接校验脚本，以及 `document/Dockerfile`、`.github/workflows/build-docs.yml`、`.github/workflows/preview-docs-build.yml`
- [x] 5. 更新 `fastgpt-home` 仓库中 `documentation-host` 契约校验脚本、夹具及配置/文案中的文档站链接
- [x] 6. 委派 `Frontend Developer` 完成 `document` 与 `fastgpt-home` 所有 `.tsx` 页面和组件的路由、元数据与交互改造
- [x] 7. 更新并运行 `document` 与 `fastgpt-home` 局部自动化测试与类型检查，完成验收闭环
