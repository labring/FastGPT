# FastGPT OpenAPI 文档 SEO & GEO 优化设计方案

## 1. 背景与现状问题评估（SEO & GEO 视角）

### 1.1 现状实现
- **应用实例端（动态 CSR）**：`projects/app/src/pages/apidoc/systemopenapi.tsx` 与 `devapi.tsx` 通过 `ScalarOpenApiPage.tsx`（使用 `next/dynamic(..., { ssr: false })`）在浏览器端异步拉取 `/api/apidoc/systemopenapi.json` 与 `/api/apidoc/devapi.json` 进行渲染；对话流式 SSE 事件示例由 `CompletionEventExamples.tsx` 与 `CompletionResponseExamples.tsx` 在客户端通过 `createPortal` 注入 DOM。
- **官方文档站（跳板页）**：`document/content/openapi/api-reference.mdx`（及 `.en.mdx`）目前仅是一张 6 行跳板页，引导开发者外部跳转至 `https://cloud.fastgpt.cn/apidoc/systemopenapi`、`https://cloud.fastgpt.io/apidoc/systemopenapi` 或 `<instance>/apidoc/systemopenapi`。

### 1.2 SEO 四大核心缺陷
1. **纯客户端渲染（CSR）与单页 `#hash` 锚点黑洞**：`ScalarOpenApiPage.tsx` 显式禁用 SSR（`ssr: false`），搜索引擎抓取 `/apidoc/systemopenapi` 只能拿到空白容器；全部分组与 50 个开放接口挤在同一个 URL 上依赖 `#hash` 定位，无法为单个接口生成独立 `<title>`、`<meta description>`、`<h1>`、`TechArticle` / `BreadcrumbList` JSON-LD 和 `sitemap.xml` 条目，彻底丧失“FastGPT 知识库搜索 API”“FastGPT 创建集合接口”等高意图长尾词自然流量。
2. **域名权重割裂与缺少 `noindex` 防重保护**：`cloud.fastgpt.*` 是控制台应用域名，并非内容权重中心（`doc.fastgpt.*`）；同时 `projects/app` 当前对 `/apidoc/*` 页面与 `/api/apidoc/*.json` 均未设置 `<meta name="robots" content="noindex">` 或 `X-Robots-Tag`，全网所有公网可访问的私有部署实例都会被搜索引擎收录相同契约内容，既分散官方权重，又存在暴露私有部署域名与内网接口元数据的风险。
3. **`doc.fastgpt.*/api/*` 路径冲突陷阱**：`document/` 本身是 Next.js 应用，`/api/*` 已被站内搜索（`/api/search`）与 Markdown 导出接口（`/api/doc-markdown`）占用，且 `document/app/robots.txt/route.ts` 对所有爬虫与 AI Bot 均输出了 `Disallow: /api/`，因此 API 参考页不能直接挂载在 `/api/*` 下。
4. **国际站 `doc.fastgpt.io` 多语言断层**：`packages/global/openapi/**` 当前全部硬编码中文标题、字段描述与示例说明；而 `doc.fastgpt.io` 采用单域名纯英文无前缀路由体系，并受 `document/script/checkEnglishDocs.mjs`（强制 1:1 `.en.mdx` 对偶文件 + 零汉字 `/\p{Script=Han}/u` 校验）与 `document/script/checkNavigation.mjs` 门禁约束。

### 1.3 GEO（AI 搜索与 Coding Agent）三大核心缺陷
1. **官方 AI 语料分卷空心化**：`document/` 已具备完善的 `/llms.txt`、`/llms-full.txt`、`/llms-openapi.txt`、单页 `<slug>.md`（含 `Accept: text/markdown` 内容协商）以及 Orama 搜索索引（`/static.json`），但由于 `content/openapi/` 下缺少具体接口参考页，`/llms-openapi.txt` 与站内搜索里完全没有具体端点 URL、字段校验规则与响应 Schema。
2. **AI 爬虫与编码助手无法消费客户端 Scalar**：`OAI-SearchBot`、`PerplexityBot`、`ClaudeBot` 及 Coding Agent 的网页抓取工具访问 `cloud.fastgpt.*/apidoc/systemopenapi` 时只能拿到 CSR 空壳；即便是抓取原始 JSON，流式 SSE 事件示例（`CompletionEventExamples.tsx`）仅在客户端渲染，AI 无法直接读取完整协议说明。
3. **文档站缺少权威机器可读 OpenAPI 入口**：HTTP 工具自动导入（如 `getApiSchemaByUrl`）、SDK 生成器及 Agent 发现工具无法从 `doc.fastgpt.*` 直接获取开放 CORS 的标准 `/openapi.json` 契约文件。

---

## 2. 总体架构方案：「同步双轨制」与范围边界

### 2.1 「同步双轨制」分工（而非彻底下线实例端）

| 站点表面 | 定位与职责 | 收录策略 | 关键能力 |
| --- | --- | --- | --- |
| **`doc.fastgpt.cn` / `doc.fastgpt.io`** | 权威 SEO 收录中心 & GEO 语料中心 | 允许索引（`sitemap.xml` + `hreflang` + JSON-LD + `llms*.txt`） | 构建期 SSG 预渲染 50 个单接口静态页 + 单页 `.md` + 静态 `/openapi.json`（CORS 开放） |
| **`cloud.fastgpt.*` 与自部署 `/apidoc/*`** | 版本绑定的交互调试台 & 离线查阅台 | **全局 `noindex, nofollow`**（HTML meta + `X-Robots-Tag`） | 保留同源免 CORS 的 Scalar「Try it out」在线发请求与私有化/二次开发完整接口查阅 |

### 2.2 公开同步范围隔离
- **仅同步 `System OpenAPI`**：即 `packages/global/openapi/provider/systemopenapi.ts` 中通过 `SystemOpenApiTagMap` 显式标记开放给团队/应用 API Key 鉴权的接口（当前共 **4 个分组、11 个模块、50 个接口操作**）。
- **`Dev API` 保留在实例端 `/apidoc/devapi`**：`Dev API` 面向源码二开、前端内部交互及 Root 管理运维，包含数百个依赖登录态 Cookie 或 `rootkey` 的接口。不将其同步到文档站页面与默认 AI 语料，可避免稀释核心开放接口权重，并防止 Coding Agent 在生成业务集成代码时误调用内部接口或混淆鉴权方式（文档站仅在 `/developers` 与 `/openapi/api-reference` 保留入口指引）。

---

## 3. URL 路由体系、模块划分与存量衔接

### 3.1 规范路径设计
- 统一挂载在现有 `/openapi/` 目录下：**`/openapi/reference/<module>/<operation>`**。
  - 生产环境遵循文档站无前缀策略：`https://doc.fastgpt.cn/openapi/reference/<module>/<operation>` 与 `https://doc.fastgpt.io/openapi/reference/<module>/<operation>`；
  - `preview` 环境沿用 `/zh-CN/openapi/reference/...` 与 `/en/openapi/reference/...`。
- **路径选型收益**：
  1. 彻底避开文档站内部 `/api/*` 路由冲突与 `robots.txt` 的 `Disallow: /api/` 拦截；
  2. 自动命中 `document/lib/llms-markdown.ts` 中 `relSlug.startsWith('/openapi/')` 规则，天然归入 `/llms-openapi.txt`；
  3. 无缝复用 `document` 现有的 `sitemap.xml`、双语 `hreflang`、`BreadcrumbList` / `TechArticle` JSON-LD、`/<slug>.md` 及 Orama 站内搜索。

### 3.2 模块目录映射（对齐 `SystemOpenApiTagMap`）

| 一级分组（`tagGroups`） | `SystemOpenApiTagMap` 键 | 模块目录 `<module>` | 中文模块名 | 英文模块名 |
| --- | --- | --- | --- | --- |
| 基础功能 | `model` | `model` | 模型管理 | Models |
| 应用管理 | `appLog` | `app-log` | 应用日志 | App Logs |
| 对话 | `chatController` | `chat-controller` | 会话操作 | Chat Completions & Control |
| 对话 | `chatHistory` | `chat-history` | 会话管理 | Chat History |
| 对话 | `chat` | `chat-record` | 对话管理 | Chat Records |
| 对话 | `chatFeedback` | `chat-feedback` | 反馈管理 | Chat Feedback |
| 知识库 | `dataset` | `dataset` | 知识库管理 | Datasets |
| 知识库 | `datasetCollection` | `dataset-collection` | 集合管理 | Collections |
| 知识库 | `datasetCollectionCreate` | `dataset-collection-create` | 集合创建 | Create Collections |
| 知识库 | `datasetData` | `dataset-data` | 数据管理 | Dataset Data |
| 知识库 | `datasetSearch` | `dataset-search` | 知识库搜索 | Dataset Search |

### 3.3 稳定 Slug 映射与侧边栏挂载
- **稳定 Slug 规则**：支持在 OpenAPI Operation 上可选声明稳定标识（如 `operationId` 或 `x-doc-slug`）；缺省按 `method + path` 去掉前导冗余前缀后确定性映射为 kebab-case slug（若同一 path 存在多 HTTP 方法或同名冲突，在路径片段后追加方法后缀消歧），并在自动化测试中锁定全部 URL 映射，避免重命名 Tag 或代码整理破坏已收录 URL（后续如确需改名，必须在 `document/middleware.ts` 的 `exactMap` 补充单跳 `301`）。
- **侧边栏组织与导航门禁兼容**：
  - `document/content/meta.json` 继续通过 `"!openapi"` 隐藏顶级平铺目录；在 `document/content/developers/meta.json`（及 `.en.json`）的 `API 参考` 分组下挂载 `"../openapi/reference"`，使全部 50 个接口页面在 `source.pageTree` 中均有且仅有一个规范归属节点（满足 `checkNavigation.mjs` 的 `counts.get(page.url) === 1` 校验）。
  - 保证每页 `title` 与 `description` 在各自语言内全局唯一，且英文页 `description` 长度严格控制在 60–160 字符区间。

### 3.4 存量页面与废弃接口衔接
- **`/openapi/api-reference` 升级**：将 `document/content/openapi/api-reference.mdx`（及 `.en.mdx`）改造为 **System OpenAPI 参考总览页**，集中提供鉴权说明、Base URL 规范、4 大能力分组与 11 个模块导航、`/openapi.json` 与 `/llms-openapi.txt` 机器可读入口，以及云服务/自部署 Scalar 调试台与 `Dev API` 入口说明。
- **`/openapi/reference` 目录落地页重定向**：在 `document/middleware.ts` 中增加 `/openapi/reference` -> `/openapi/api-reference` 单跳 `301`，防止用户或爬虫截断 URL 访问目录根路径时出现 `404`。
- **废弃接口平滑降权**：当 OpenAPI Operation 声明 `deprecated: true`（如 `POST /v1/chat/completions`）时，生成器自动在对应 MDX frontmatter 写入 `deprecated: true`，并在正文顶部展示迁移提示（推荐跳转 `/openapi/reference/chat-controller/...` 即 `/v2/chat/completions`）。借助 `document` 现有 `deprecated` 机制，该页面将自动获得 `noindex` 元信息并从 `sitemap.xml` 与 `llms*.txt` 中剔除，同时保留历史直达 URL。
- **`ApiReferenceNotice` 更新**：调整 `document/lib/api-reference-notice.ts` 与相关测试，将首要推荐入口指向文档站自身 `/openapi/api-reference`（及其对应的官方在线参考），同时保留云服务与 `<instance>/apidoc/systemopenapi` 作为在线调试地址。

---

## 4. 单接口静态 MDX 页面规范（SEO + 纯净 Markdown 导出兼容）

### 4.1 选型原因：纯静态结构化 MDX 优于动态 `<APIPage />`
`document/lib/llms-markdown.ts` 的 `remarkCleanLlmsMdx` 通过解析物理 `.mdx` 文件的 AST 生成 `/<slug>.md` 与 `/llms-openapi.txt`；若正文只挂载一个客户端交互组件，导出的 Markdown 会丢失全部参数、校验规则与响应示例。同时，纯静态 MDX 不引入客户端 OpenAPI UI 运行时包，能保持最优 LCP 性能且避免浏览器端跨域（CORS）调用难题。

### 4.2 单页 6 段标准结构
每份生成的 `.mdx` / `.en.mdx` 严格遵守 `checkNavigation.mjs`（正文中不写 `# ` H1 标题）与 Fumadocs 渲染规范：
1. **Frontmatter**：
   - `title`：简洁业务动作名（用于侧边栏与 `<h1>`，全局唯一）；
   - `seoTitle`：高意图搜索标题（格式如 `<动作名> - <METHOD> /api/... | FastGPT OpenAPI`），兼顾自然语言检索与精准接口路径检索；
   - `description`：120–160 字符（英文 60–160 字符）的接口核心语义与鉴权摘要，全局唯一；
   - 可选 `deprecated: true`。
2. **端点概览与在线调试入口**：
   - 展示 HTTP 方法、完整请求路径（`/api/...`）、支持的 API Key 作用域（团队个人 API Key / 应用 API Key / `authProxy` 说明）；
   - 提供「在线调试（Scalar）」外链按钮/提示，直接指向对应环境实例调试页（中文站链接 `https://cloud.fastgpt.cn/apidoc/systemopenapi#<scalar-anchor>`，英文站链接 `https://cloud.fastgpt.io/apidoc/systemopenapi#<scalar-anchor>`，并注明自部署用户将域名替换为自身实例地址）。
3. **接口说明与注意事项**：完整渲染 OpenAPI Operation `description`（含版本限制、兼容性说明、参数优先级）。
4. **请求参数详解（Path / Query / Body）**：
   - 基于 `prepareOpenApiUnionPresentation(apiDocOpenAPIDocument)` 处理后的契约展开 Schema；
   - 对带有 `x-fastgpt-union-group` 或 `oneOf`/`anyOf` 互斥分支的接口（如 `createPaginationSchema` 的 `offset` vs `pageNum`、`LinkedPaginationSchema` 的四分支游标、集合创建分支等），按分支小节渲染互斥说明与完整字段表（字段名、类型、是否必填、默认值、枚举/范围约束、说明）。
5. **请求示例**：基于 `setRequiredRequestExamples` 补全后的必填示例，输出可直接执行的 `cURL`（含 `Authorization: Bearer <apiKey>` 请求头与最小合法 JSON 请求体）。
6. **响应结构与 SSE 事件示例**：
   - 渲染 `200` 响应 `data` 字段结构表与典型 JSON 响应示例（及显式声明的错误响应如 `409`）；
   - 针对 `/v1/chat/completions` 与 `/v2/chat/completions`，直接复用 `@fastgpt/global/openapi/core/chat/completion/examples` 的 `getChatCompletionResponseExamples`，将非流式响应示例与全部 SSE `event` 示例（`answer`、`flowNodeStatus`、`flowNodeResponse`、`interactive`、`workflowDuration` 等）静态展开到 MDX 文档中，补齐此前客户端 Portal 注入导致爬虫与 AI 无法抓取的盲区。

---

## 5. GEO 机器可读端点与语料分层方案

### 5.1 文档站静态 `/openapi.json` 路由
- 新增 `document/app/openapi.json/route.ts`（声明 `export const dynamic = 'force-static'`）。
- 运行逻辑：
  1. 根据 `getFastGPTDocsLocale()` / `DOCS_SITE_VARIANT` 读取对应语言的静态契约产物（`document/data/openapi/systemopenapi.zh-CN.json` 或 `systemopenapi.en.json`）；
  2. 将 `servers` 配置为当前站点的推荐云端服务入口与自部署相对入口（中国大陆站：`https://cloud.fastgpt.cn/api` + `/api`；国际站：`https://cloud.fastgpt.io/api` + `/api`）；
  3. 响应头固定返回：
     - `Content-Type: application/json; charset=utf-8`
     - `Access-Control-Allow-Origin: *`（便于 Coding Agent、HTTP 工具导入与第三方集成直接拉取）
     - `X-Robots-Tag: noindex`（防止原始大 JSON 被当作网页结果展示在搜索结果页）。

### 5.2 `robots.txt` 与 `llms*.txt` 语料分层
- **`document/app/robots.txt/route.ts`**：在顶部机器发现注释区补充 `# OpenAPI 3.1 Spec: ${domain}/openapi.json`（与现有的 `# AI Context`、`# Pricing & Editions` 并列）。
- **`document/lib/llms-markdown.ts`**：
  - `buildLlmsIndexText`（`/llms.txt`）：在头部总索引链接中增加 `[System OpenAPI 3.1 JSON Spec](${domain}/openapi.json)`，并在 `Developers & OpenAPI` 分组自动列出 50 个非废弃接口规范页面的规范链接与描述；
  - `/llms-openapi.txt`：由 `matchesLlmsBundle(relSlug, 'openapi')` 自动完整收录所有指南与 `/openapi/reference/**` 下的全部非废弃接口完整 Markdown，作为开发者与 Coding Agent 专项语料库；
  - **`/llms-full.txt` 体积防护策略**：同步生成 50 页接口后实测 `/llms-full.txt` 总字符数与 Token 增量。若全量字段表导致 `llms-full.txt` 体积过度膨胀，则调整 `buildLlmsFullText` 在 `bundle === undefined` 模式下对 `/openapi/reference/**` 仅输出接口方法/路径摘要与单页 `.md` / `/llms-openapi.txt` 导流链接，避免挤占通用问答的上下文预算。

---

## 6. 国际站 `doc.fastgpt.io` 非侵入式双语方案

1. **结构化英文翻译映射表**：在 `document/data/openapi/en-translations.json` 维护英文契约映射，涵盖：
   - 4 个分组、11 个模块标签及通用术语；
   - 50 个接口的 `title`、`seoTitle`、`description`、接口长文本 `summary`/`description`、互斥分支标题与 SSE `event` 示例说明；
   - 按「中文原文哈希 -> 英文译文」（支持按 `operation + path` 局部覆盖）存储字段描述、枚举说明与错误示例文案，**完全不修改 `packages/global/openapi/**` 业务 Zod 源码**，保障实例端运行时与既有测试零风险。
2. **严格覆盖率与零汉字门禁**：
   - 同步生成器在导出 `.en.mdx`、`meta.en.json` 与 `systemopenapi.en.json` 时，会逐条校验中文源码的哈希匹配情况：只要未来在 `packages/global/openapi` 中新增 System OpenAPI 接口或修改中文描述，生成器立即以明确缺失列表报错退出，强制补齐英文映射；
   - 对最终英文产物全量执行 `/\p{Script=Han}/u` 扫描，杜绝任何中文字符漏出，确保 100% 通过 `document/script/checkEnglishDocs.mjs` 与 `checkNavigation.mjs`。
3. **双站 `hreflang` 对齐**：由于中英文保持 1:1 相同的 `/openapi/reference/<module>/<operation>` 路径，`document/app/sitemap.xml/route.ts` 与 `[...slug]/page.tsx` 自动为全部非废弃接口输出双向 `<link rel="alternate" hreflang="zh-CN" />`、`hreflang="en"` 与 `hreflang="x-default"`。

---

## 7. 实例端 `/apidoc/*` 防重收录改造（`projects/app`）

为了消除 `cloud.fastgpt.*` 与公网私有化部署实例端 `/apidoc/*` 与 `doc.fastgpt.*` 的重复收录竞争，同时完整保留同源调试能力：
1. **HTML Meta `noindex`**：在 `projects/app/src/web/context/AppShell.tsx` 中针对 `openAPIReferenceRoutes`（`/apidoc/devapi`、`/apidoc/systemopenapi`），向 `NextHead`（`projects/app/src/components/common/NextHead/index.tsx`）传递 `robots="noindex, nofollow"` 以输出 `<meta name="robots" content="noindex, nofollow" />`。
2. **HTTP 响应头 `X-Robots-Tag`**：在 `projects/app/src/pages/apidoc/{systemopenapi,devapi}.tsx`（或 Next.js `headers` 配置）以及 `projects/app/src/pages/api/apidoc/{systemopenapi,devapi}.json.ts` 中统一补充响应头 `X-Robots-Tag: noindex, nofollow`。
3. **保留既有应用内入口**：`projects/app/src/components/support/apikey/Table.tsx` 等应用控制台内部跳往本机 `/apidoc/systemopenapi` 的链接保持不变，不影响用户本地调试与离线部署体验。

---

## 8. 契约同步流水线与防漂移门禁（零部署 `.yml` 改动）

### 8.1 确定性生成与入库方案
- 在根 `package.json`（及 `document/package.json`）提供同步命令 `pnpm sync:openapi-docs`（运行在 Node v24 `--experimental-strip-types` 下直接加载 `@fastgpt/global/openapi/provider/systemopenapi` 及相关工具）。
- 同步产物全部落盘于 `document/` 并提交至 Git：
  - `document/content/openapi/reference/**`（各模块目录、`meta.json`、`meta.en.json`、50 组中英文 `.mdx` / `.en.mdx`）；
  - `document/data/openapi/systemopenapi.zh-CN.json` 与 `document/data/openapi/systemopenapi.en.json`；
  - 更新 `document/content/developers/meta.json`、`meta.en.json`、`document/content/toc.mdx` 与 `toc.en.mdx`。
- **架构与部署兼容性**：
  - `document/Dockerfile` 构建上下文仅限 `./document`，产物入库后无需改动 `document/Dockerfile` 或 `.github/workflows/build-docs.yml` / `preview-docs-build.yml`；
  - 变更自然命中 CI 的 `document/**` 路径触发器；同时保留 Git 文件历史，供 `document/data/doc-last-modified.json` 与 `sitemap.xml` 的 `<lastmod>` 使用。

### 8.2 防漂移测试与文档质量门禁
1. **防漂移一致性测试**：在单元测试中实时调用生成器并在内存中比对 `document/content/openapi/reference/**` 与 `document/data/openapi/systemopenapi.*.json`；只要开发者修改了 `packages/global/openapi` 中带 `SystemOpenApiTagMap` 的接口而未重新运行 `pnpm sync:openapi-docs`，测试立即报错阻断，彻底杜绝文档与代码契约漂移。
2. **文档站全链路验收**：生成产物需 100% 通过 `document` 现有门禁与单元测试：
   - `pnpm --filter @fastgpt/document check:docs`（`checkDocRefs.js`、`checkEnglishDocs.mjs`、`checkNavigation.mjs`）；
   - `pnpm --filter @fastgpt/document test:checks` 与 `test:site`；
   - `pnpm --filter @fastgpt/document build` 静态构建及输出验证（抽检 `/openapi/reference/**` HTML Meta / JSON-LD / `hreflang`、`/<slug>.md`、`/openapi.json`、`/llms.txt`、`/llms-openapi.txt`、`/sitemap.xml`、`/robots.txt`）。

---

## 9. TODO 清单

- [x] **1. 英文翻译映射表与生成器核心**：在 `document/script/` 新增 OpenAPI 文档同步脚本与确定性 Slug 映射工具，建立 `document/data/openapi/en-translations.json` 并实现中文原文哈希校验与零汉字门禁。
- [x] **2. 同步生成静态页面与契约 JSON**：运行 `pnpm sync:openapi-docs` 生成 `document/content/openapi/reference/**`（50 组中英文 MDX + `meta*.json`）、`document/data/openapi/systemopenapi.{zh-CN,en}.json` 与更新后 `toc*.mdx`。
- [x] **3. 升级文档站存量路由与 GEO 端点**：
  - [x] 新增 `document/app/openapi.json/route.ts`（CORS 开放 + `X-Robots-Tag: noindex`）；
  - [x] 更新 `document/app/robots.txt/route.ts` 与 `document/lib/llms-markdown.ts`（含实测 `/llms-full.txt` 体积并决定是否对 `/openapi/reference/**` 启用摘要模式）；
  - [x] 升级 `document/content/openapi/api-reference.{mdx,en.mdx}`、`document/content/developers/meta.{json,en.json}`、`document/lib/api-reference-notice.ts` 与 `document/middleware.ts`（`/openapi/reference` 重定向至 `/openapi/api-reference`）。
- [x] **4. 实例端 `/apidoc/*` `noindex` 加固**：更新 `projects/app/src/web/context/AppShell.tsx`、`NextHead`、`projects/app/next.config.ts`（`headers()` 规则覆盖 `/apidoc/:path*` 与 `/api/apidoc/:path*`）与 `projects/app/src/pages/api/apidoc/{systemopenapi,devapi}.json.ts`，注入 `<meta name="robots" content="noindex, nofollow" />` 与 `X-Robots-Tag: noindex, nofollow`。
- [x] **5. 防漂移单测与文档门禁验收**：补充契约防漂移一致性单测、`document` 路由/语料测试及主应用 `apidoc` `noindex` 测试，确保 `document` 相关门禁、`test:checks`、双变体 `next build`、`site.test.mjs` 对应契约及主应用单测通过（排除仓内基线既有的 3 处未触及文件失败）。
