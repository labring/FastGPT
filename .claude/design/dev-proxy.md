# 本地开发代理线上环境方案

## 背景

本地开发时，前端代码在本地运行，但不想搭建本地数据库和后端服务，希望 API 请求直接打到线上环境。

## 架构

```
浏览器
  │  HTTP 请求 localhost:3000/api/*
  ▼
Next.js dev server（本地前端代码）
  │  beforeFiles rewrite（HTTP，无 TLS）
  ▼
本地 HTTP 中间代理 localhost:19444
  │  Node.js 原生 https.request()
  │  rejectUnauthorized: false
  ▼
生产服务器 https://<ip>:<port>
```

## 关键设计决策

### 1. 为什么用 `beforeFiles` rewrite？

Next.js rewrites 默认是 `afterFiles`，会先匹配本地文件系统。FastGPT 本地存在完整的 API 路由文件（如 `/api/core/app/list.ts`），会优先命中本地路由，rewrite 永远不执行。

改为 `beforeFiles` 后，rewrite 在文件系统检查之前运行，本地 API 路由完全绕过。

### 2. 为什么需要本地 HTTP 中间代理？

Next.js 14+ 内部用 `undici` 执行 rewrites 代理。`undici` 有独立的 TLS 实现，不读取 `NODE_TLS_REJECT_UNAUTHORIZED` 环境变量，无法通过该变量跳过自签名证书校验。

解决方案：在本地启一个 HTTP 代理服务器，Next.js rewrite 指向它（HTTP，无 TLS 问题），由它用 Node.js 原生 `https.request()` 转发到线上（支持 `rejectUnauthorized: false`）。

### 3. Cookie 如何透传？

本地 HTTP 代理转发请求时复制所有原始请求头（`headers: { ...req.headers }`），浏览器携带的 `cookie` 原样转发到生产服务器。

## 使用方式

### 启动命令

```bash
cd projects/app
pnpm dev:proxy
# 或指定目标地址
pnpm dev:proxy url=https://10.109.96.195:19443
```

### 配置文件

`scripts/dev-proxy.js` 中修改默认地址：

```js
const DEFAULT_PROXY_URL = 'https://your-production-server';
```

### 鉴权（Cookie 设置）

生产服务器使用 `fastgpt_token` HttpOnly Cookie 鉴权。由于该 Cookie 是生产域名下的，不会自动出现在 localhost，需手动设置一次：

1. 在生产环境登录，打开 DevTools → Application → Cookies，复制 `fastgpt_token` 的值
2. 在 localhost 的控制台执行：

```js
document.cookie = "fastgpt_token=<token值>; path=/; max-age=604800"
```

之后代理会自动携带该 Cookie 转发到生产服务器。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `scripts/dev-proxy.js` | 启动脚本：运行本地 HTTP 中间代理 + Next.js dev server |
| `next.config.js` | `beforeFiles` rewrite，将 `/api/*` 转发到本地代理 |
| `src/middleware.ts` | 打印每次代理请求的日志 |
| `.env.local` | `PROXY_API_TARGET` 配置代理目标 |
