---
case_version: 1
id: "FG-CHAT-CONVERSATION-008"
title: "沙箱文件预览令牌签发、opensandbox-proxy 无 Cookie 流式代理、Byte Range 分片与 CSP 隔离"
business: "chat/conversation"
types:
  - "api"
  - "integration"
category: "boundary"
scenario: "special"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/chat/conversation/FG-CHAT-CONVERSATION-008.mjs
    items: [C1, C2, C3, C4]
tags:
  - "sandbox"
  - "preview"
  - "security"
  - "range"
  - "csp"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "cache"
sources:
  - "projects/app/src/pages/api/core/ai/sandbox/getFilePreviewLink.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/verifyTicket.ts"
  - "projects/opensandbox-proxy/src/preview.ts"
  - "packages/service/core/ai/sandbox/application/preview.ts"
routes:
  - "POST /api/core/ai/sandbox/getFilePreviewLink"
  - "GET /api/core/ai/sandbox/verifyTicket"
  - "GET /preview/:sessionId/*path"
  - "HEAD /preview/:sessionId/*path"
related:
  - "FG-CHAT-CONVERSATION-007"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# 沙箱文件预览令牌签发、opensandbox-proxy 无 Cookie 流式代理、Byte Range 分片与 CSP 隔离

## 用例简介

验证 OpenSandbox 架构下边缘 `opensandbox-proxy` 的只读流式预览链路：`getFilePreviewLink` 基于 Redis ZSET 签发 24 位随机 `sessionId` 与 `expiresAt`（限制单沙箱最多 500 个活跃链接），边缘代理 `/preview/:sessionId/*path` 在不依赖任何 Cookie/Authorization 的前提下经 `verifyTicket` 解析会话并流式透传 `execd` `/files/download`，支持 HTML、通用媒体文件及相对静态资源（JS/SVG/二进制）的 `GET`/`HEAD` 读取、目录尾斜杠默认补全 `index.html`、HTTP `Range` (`206 Partial Content` / `416 Range Not Satisfiable`) 分片加载、严格不透明源 `CSP: sandbox` 安全响应头，以及词法路径越界拦截与配额限制。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、OpenSandbox Proxy (`127.0.0.1:1006`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)、Redis。
- 复用 `appKeyWorld` 创建独立测试应用 `W` 并开启 Agent 沙箱能力，在会话目录内构造 `dist/index.html`、`dist/app.js`、`dist/icon.svg` 与 `dist/media.bin`。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础与异常；已写入 HTML 与 JS | 对不存在的文件及目录路径 `dist` 调用 `getFilePreviewLink`；随后对 `dist/app.js` 与 `dist/index.html` 调用 `getFilePreviewLink` 获取 `{ url, expiresAt }`，并在不携带任何 Cookie/Token 的情况下向 `opensandbox-proxy` 发起 `GET` 与 `HEAD` 请求访问 `dist/index.html`、同目录 `dist/app.js`、尾斜杠目录 `dist/` 及不存在路径 `dist/not-found.txt`。 |
| C2 | 分片加载；已写入二进制文件 | 通过无凭证预览链接对 `dist/media.bin` 分别发送 `Range: bytes=0-9`、`Range: bytes=-6` 与越界 `Range: bytes=9999-10000` 请求。 |
| C3 | 安全响应头与方法限制；已签发预览会话 | 请求 `dist/index.html`、`dist/icon.svg` 与 `dist/app.js`，核对 `Content-Security-Policy`（含 `sandbox allow-scripts` 且不含 `allow-same-origin`）、`X-Content-Type-Options: nosniff`、`Access-Control-Allow-Origin: *`、`Referrer-Policy: no-referrer`；同时测试 `POST` 方法请求预览路由。 |
| C4 | 令牌校验、路径边界与配额；独立会话 | 测试非法格式 `sessionId`、伪造不存在的 24 位 `sessionId`、签发阶段词法越界路径（`/etc/hosts`、`../../../etc/hosts`、`/workspace`）与代理阶段编码穿越路径（`%2e%2e/etc/hosts`、反斜杠）；填充单沙箱活跃链接上限后再次调用 `getFilePreviewLink`。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 不存在文件与目录路径签发均返回 `400`；有效文件签发含 24 位 `sessionId` 的预览 `url` 与 `expiresAt`，匿名 `GET`/`HEAD` 成功读取 HTML、尾斜杠目录默认 `index.html` 及相对路径下的 `dist/app.js`，访问缺失文件返回 `404`。 | 签发 URL、匿名 `GET`/`HEAD` 状态码与正文。 |
| C2 | `bytes=0-9` 与 `bytes=-6` 返回 `206 Partial Content`、精确 `Content-Range` 与对应分片字节；越界 Range 返回 `416 Range Not Satisfiable`。 | `206`/`416` 响应头与分片内容。 |
| C3 | HTML、SVG 与 JS 均下发严格 `CSP: sandbox allow-scripts allow-forms allow-popups;`（不含 `allow-same-origin`）、`nosniff` 与 CORS 头；`POST` 请求返回 `405`。 | 安全响应头快照与 `405` 状态码。 |
| C4 | 非法格式 `sessionId` 返回 `400`，伪造 24 位 `sessionId` 返回 `403`；签发与代理阶段的 `/workspace` 外路径、`.fastgpt` 内部运行时目录及 `..` 路径穿越返回 `400`/`403`；单沙箱超过 500 个活跃预览会话上限时 `getFilePreviewLink` 返回 `429`。 | `400`/`403`/`429` 响应记录。 |
