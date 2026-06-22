---
capability_label: null
doc_type: "02"
doc_label: "API架构"
generated_at: "2026-06-18T12:00:00.000Z"
parent_module: null
roles: []
router_paths: []
---

# API 架构

> 本文档描述项目的前端 HTTP 请求层架构，不涉及具体接口定义（接口定义见业务能力文档）。

## 请求层封装

### 请求模块概览

项目前端包含三套 HTTP 请求模块，分别服务于不同的后端目标：

| 模块 | 核心文件 | 用途 | 底层库 |
|------|---------|------|--------|
| 主业务 API | `projects/app/src/web/common/api/request.ts` | FastGPT 后端 REST API | axios |
| Laf API | `projects/app/src/web/common/api/lafRequest.ts` | Laf 云函数调用 | axios |
| SSE 流式 | `projects/app/src/web/common/api/fetch.ts` | AI 对话流式响应、工作流 Copilot | @fortaine/fetch-event-source |

### Axios 实例（主业务 API）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| baseURL | `getWebReqUrl('/api')` | 通过 `NEXT_PUBLIC_BASE_URL` 环境变量动态注入子路由前缀 |
| timeout | 60000ms | 请求超时时间 |
| withCredentials | 按请求配置 | 由调用方通过 ConfigType 可选传入 |

**关键文件**: `projects/app/src/web/common/api/request.ts`

**封装模式**: 单例 axios 实例 + `GET`/`POST`/`PUT`/`DELETE` 四方法导出。底层调用 `instance.request()` 统一处理参数格式、取消信号和重复请求控制。

### Axios 实例（Laf API）

| 配置项 | 值 | 说明 |
|--------|-----|------|
| baseURL | `/api/lafApi` | 经 Next.js API 路由代理至 Laf 云函数 |
| timeout | 60000ms | 请求超时时间 |
| headers | `content-type: application/json` | 固定 Content-Type |

**关键文件**: `projects/app/src/web/common/api/lafRequest.ts`

### 请求拦截器

**主业务 API**:
- `startInterceptors`: 当前为空实现（占位），不做额外注入

**Laf API**:
- `startInterceptors`: 从 `useUserStore` 读取 `lafAccount.token`，注入 `Authorization: Bearer <token>` 请求头
- 公共参数处理：请求发送前自动删除值为 `null` 或 `undefined` 的参数键（与主业务 API 仅删除 `undefined` 不同）

### 响应拦截器

**主业务 API**:
- `responseSuccess`: 透传响应，不做额外处理
- `responseError`: 触发统一错误处理流程（详见错误处理机制）
- `checkRes`: 校验 `response.data.code` 是否在 200-399 范围，提取 `data.data` 作为返回值

**Laf API**:
- `responseSuccess`: 透传响应
- `responseError`: 触发 Laf 专用错误处理（含 401 自动 token 刷新重试）
- `checkRes`: 校验 `res.error` 字段，无错误则提取 `res.data`

### SSE 流式请求

**关键文件**: `projects/app/src/web/common/api/fetch.ts`

基于 `@fortaine/fetch-event-source` 库实现 Server-Sent Events 消费。核心函数：

| 函数 | 用途 |
|------|------|
| `streamFetch` | 发起 AI 对话流式请求（`/api/v2/chat/completions`） |
| `streamResumeFetch` | 恢复中断的流式会话（`/api/core/chat/resume`） |
| `onOptimizePrompt` | Prompt 优化流式请求 |
| `onOptimizeCode` | 代码优化流式请求 |
| `onWorkflowCopilot` | 工作流 Copilot 流式请求 |

SSE 内部使用 `requestAnimationFrame` 驱动的响应队列（`animateResponseLoop`）控制渲染节奏，队列积压时批量消费（每次取 `Math.max(1, Math.round(queue.length / 30))` 条），避免高频 DOM 更新阻塞主线程。

### 取消重复请求

**主业务 API**: 基于 `maxQuantity` 参数的并发控制。同一 URL 最多允许 `maxQuantity` 个并行请求，超出时取消最早请求（FIFO 淘汰），通过 `AbortController` 实现。

**Laf API**: 简化版并发控制，同一 URL 仅跟踪请求计数，超出 `maxQuantity` 时直接 abort 当前请求并重置计数器。

SSE 流式请求通过外部传入的 `AbortController` 控制取消。

## 错误处理机制

### 错误分类

| 错误类型 | 判断条件 | 处理方式 |
|---------|---------|---------|
| 业务错误 | `code < 200` 或 `code >= 400` | Promise reject，由调用方处理 |
| Token 失效 | `data.code === 403`（`TOKEN_ERROR_CODE`） | 清空 token → 跳转登录页（外链/分享/聊天页除外） |
| 余额不足 | `data.statusText` 匹配 `TeamErrEnum` 中资源不足枚举 | 弹出资源不足模态框（外链页除外） |
| 服务端异常 | `data === undefined` | reject 提示"服务器异常" |
| 网络异常 | axios 网络错误 / timeout | 统一 `responseError` 处理，展示错误信息 |
| 未知错误 | `err` 为 falsy | reject 提示"未知错误" |

### 错误码映射

未发现前端错误码映射表，后端返回的 `message` 字段直接展示给用户。特殊处理的错误码：
- `TOKEN_ERROR_CODE = { 403: "token 无效" }` → 触发登录跳转
- `TeamErrEnum` 中 7 个资源不足枚举 → 触发余额不足模态框

### 页面例外保护

以下页面在 Token 失效和余额不足时**不触发**页面跳转或模态框（保护外链用户体验）：
- `/chat/share` — 分享对话页
- `/price` — 价格页
- `/login` — 登录页

### Laf API 特殊错误处理

- **401 响应**: 自动使用存储的 PAT（Personal Access Token）换取新 token，成功后静默重试原始请求，失败则提示"登录凭证过期"
- **其他错误**: 直接 reject `err.response.data`

### 浏览器全局错误日志

**关键文件**: `projects/app/src/web/common/utils/errorLogger.ts`

独立的浏览器端错误日志收集器（非请求层），覆盖 `console.error`、`window.onerror`、`unhandledrejection`，保留最近 20 条错误记录。通过 `errorLogger.getLogs()` 查看。

## 公共参数

| 参数 | 来源 | 说明 |
|------|------|------|
| `NEXT_PUBLIC_BASE_URL`（子路由前缀） | 环境变量 | 通过 `getWebReqUrl()` 自动为所有 API 路径添加前缀 |
| `lafAccount.token` | Zustand Store (`useUserStore`) | Laf API 请求拦截器中自动注入 Bearer token |
| Date 对象序列化 | 请求体自动处理 | `request()` 中将 `Date` 实例转为 `dayjs(val).format()` 字符串 |
| `undefined` 值清理 | 请求体自动处理 | `request()` 中自动删除值为 `undefined` 的参数键 |
| `cTime` | 自动生成 | SSE 流式请求自动附加当前时间戳 |
| `detail: true, stream: true` | 硬编码 | SSE 流式请求固定参数 |

## 环境切换

### Base URL 配置

| 环境 | base URL | 配置来源 |
|------|---------|---------|
| development | `/api`（Next.js 内部路由） | 无需独立 API 域名，Next.js API Routes 同源 |
| 子路径部署 | `{NEXT_PUBLIC_BASE_URL}/api` | `.env.local` 中 `NEXT_PUBLIC_BASE_URL=/fastai` |
| Laf API | `/api/lafApi` | Next.js API Routes 代理转发至 Laf 云函数 |

`NEXT_PUBLIC_BASE_URL` 同时控制：
- Next.js `basePath`（`next.config.ts` 第 13 行）
- 前端 API 请求路径前缀（`getWebReqUrl()` 函数）

### 代理配置

项目使用 Next.js API Routes 作为 BFF 层，前端请求同源的 `/api/*` 路径由 Next.js 服务端处理并转发至后端微服务。不存在独立的 vite/webpack devServer proxy 配置。

### 环境变量（API 相关）

| 变量 | 说明 | 示例 |
|------|------|------|
| `NEXT_PUBLIC_BASE_URL` | 子路由前缀，打包时确定 | `/fastai` |
| `FE_DOMAIN` | 前端页面域名，用于补全相对路径资源 | `http://localhost:3000` |
| `PRO_URL` | 商业版后端地址（服务端使用） | `http://127.0.0.1:3000` |

## 禁项自检

- [x] 未包含业务源码片段（所有代码引用均为文件路径 + 行号范围的模式描述）
- [x] 未包含用户故事句式
- [x] 未编造不存在的 API 定义
- [x] 所有文件路径均来自实际代码探索
- [x] 未包含构建配置内容（webpack/vite.config/tsconfig）
- [x] 未包含变更记录/Changelog
- [x] 未包含版本差异说明
- [x] 未包含设计决策或演进历史

## 自检清单

- [x] frontmatter 字段齐全（capability_label=null, doc_type="02", doc_label="API架构", generated_at, parent_module=null, roles=[], router_paths=[]）
- [x] 每个代码模式引用都对应项目中的真实文件
- [x] 环境切换的 base URL 从实际 .env 文件提取，非占位符
- [x] 禁项自检通过
