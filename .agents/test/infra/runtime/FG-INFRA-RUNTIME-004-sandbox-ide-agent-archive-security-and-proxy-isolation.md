---
case_version: 1
id: "FG-INFRA-RUNTIME-004"
title: "IDE Agent 归档传输边界、逐实例口令鉴权与 Sandbox Proxy 通道/预览隔离"
business: "infra/runtime"
types: [api, integration]
category: abnormal
scenario: failure
priority: P0
status: ready
tags: [ide-agent, agent-sandbox-proxy, archive, preview, websocket, abnormal, boundary]
evidence: [response, storage]
sources:
  - projects/fastgpt-ide-agent/src/archive.rs
  - projects/fastgpt-ide-agent/src/connection.rs
  - projects/fastgpt-ide-agent/src/password.rs
  - projects/fastgpt-ide-agent/src/preview.rs
  - projects/agent-sandbox-proxy/src/auth.rs
  - projects/agent-sandbox-proxy/src/preview.rs
  - packages/service/common/file/zip.ts
  - packages/service/common/file/tarZst.ts
  - packages/service/core/ai/sandbox/application/ideAgent.ts
  - packages/service/core/ai/sandbox/application/preview.ts
  - packages/service/core/ai/sandbox/application/file.ts
  - projects/app/src/pages/api/core/ai/sandbox/extractZip.ts
  - projects/app/src/pages/api/core/ai/sandbox/getHtmlPreviewLink.ts
  - projects/app/src/pages/api/core/ai/sandbox/verifyTicket.ts
routes:
  - "/api/core/ai/sandbox/upload"
  - "/api/core/ai/sandbox/extractZip"
  - "/api/core/ai/sandbox/getTicket"
  - "/api/core/ai/sandbox/getHtmlPreviewLink"
  - "/api/core/ai/sandbox/verifyTicket"
related:
  - "FG-INFRA-RUNTIME-003"
  - "FG-SKILL-DEBUGGING-001"
automation: []
baseline: "da60070ba4f8321e54dd349243f6c9cae0bd2e99"
---

# IDE Agent 归档传输边界、逐实例口令鉴权与 Sandbox Proxy 通道/预览隔离

## 用例简介

验证 `fastgpt-ide-agent` 与 `agent-sandbox-proxy` 在容器内、代理网关和主站 API 三层的边界控制：agent 归档只做流式传输（损坏流拒绝、`..` 条目跳过、经软链父目录写出目标目录被拒绝、支持 `workspace` 与 `home` 双 scope 打包解包、挂载点根 `lost+found` 跳过），逐实例随机口令 `/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password` 校验，`extractZip` 回归沙盒内 `unzip`，HTTP Range/HEAD 预览安全头，以及跨通道/只读票据越权拒绝。归档信任边界以 `.agents/design/core/ai/sandbox/index.md` 第 4、6 节为准。

## 前置准备

- 环境与版本：本地 FastGPT 应用、OpenSandbox Server、`fastgpt-agent-sandbox` 最新镜像及 `fastgpt-agent-sandbox-proxy` 服务已按相同 `AGENT_SANDBOX_PROXY_SECRET`（≥32 字节）、`AGENT_SANDBOX_PROXY_URL`（`ws://` 或 `wss://`）与 `AGENT_SANDBOX_PREVIEW_PROXY_URL`（`http://` 或 `https://`）启动并连通。代码基线为当前 `feat/opensandbox-pvc-s3` 分支（含 `tarZst.ts`、`zip.ts` 与 `archive.rs` 归档边界收敛）。
- 身份与权限：使用独立测试账号与已发布启用沙箱的简单应用（`appId` + `chatId`），以及调试用 Skill（验证 `terminal` 通道差异）。
- 测试数据：准备 `hello.html`、`binary.txt`（精确 10 字节 `0123456789`）、损坏文件 `bad.zip`、包含 `../evil-zipslip.txt` 条目的 `evil-zipslip.zip`、含 UNIX 软链条目的 `link.zip` 与合法 `good.zip`；在运行中容器内构造 `/workspace/lost+found/`（root 属主 `0700`）测试文件与指向 `/etc/passwd` 的符号链接。
- 复位约定：S1 围绕容器内 `ide-agent` 归档/恢复直接校验（可在 Docker 与 K8s `uid=10001` 沙箱执行）；S2～S4 基于同一活沙箱会话顺序执行；结束时统一删除测试应用、Skill、容器与卷。
- 验证能力：HTTP API 响应与响应头校验、WebSocket JSON-RPC 客户端通信、`docker exec` / `kubectl exec` 只读检查容器文件与权限、S3 归档返回码检查。
- 关联标识：按测试 `appId`、`chatId`、`sandboxId` 与临时 `previewSessionId` 跟踪验证。
- 清理方式：依次清理容器实例、卷声明、测试应用及测试数据库记录。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| S1 | 异常/边界场景；运行中的 `fastgpt-ide-agent`（覆盖 `uid=10001` 非 root 与 `/home/sandbox/lost+found/` 预置文件） | 检查 `/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password` 存在且权限为 `0600`、未携带 `x-fastgpt-agent-token` 或错误口令访问 `ide-agent` 内部 HTTP/WS 接口；向 `POST /archive/extract` 提交损坏 `.tar.zst`、含 `../` 条目的 `.tar.zst`、先建 `esc -> /tmp` 软链再写 `esc/pwned.txt` 的 `.tar.zst`；对含 `$HOME` 用户文件、缓存目录和 `lost+found` 的沙盒调用 `POST /archive/pack`。 |
| S2 | 异常与主链路场景；通过 `appId` 与 `chatId` 唤醒应用沙箱，上传测试包后操作 | 分别对 `bad.zip`、`evil-zipslip.zip`、`link.zip` 与 `good.zip` 调用 `POST /api/core/ai/sandbox/extractZip`（`body: { appId, chatId, path }`）；确认工作区外未出现 `evil-zipslip.txt`。 |
| S3 | 安全与边界场景；沙箱内已有 `hello.html`、`binary.txt`（10 字节）、`/workspace/lost+found/secret.txt` 及 `/workspace/.../outside.html -> /etc/passwd` | 调用 `POST /api/core/ai/sandbox/getHtmlPreviewLink` 分别传入 `binary.txt`、`nope.html` 与 `hello.html`；使用返回 URL 请求 `GET hello.html`，并对同路径下的 `binary.txt` 依次发送 `HEAD`、`GET (Range: bytes=0-3)` 与 `GET (Range: bytes=999-1000)`，再尝试通过预览 URL 访问 `lost+found/secret.txt` 与 `outside.html`。 |
| S4 | 越权边界场景；复用上述活跃沙箱 | 分别请求 `app` 的 `terminal` 票据、`fs` `write` 票据与 `fs` `read` 票据；尝试用 `write` `ws` 票据访问 `/preview/{ticket}/hello.html`、用预览 `sessionId` 连接 `/fs?ticket=...` WebSocket；使用 `read` 票据通过 `/fs` 调用 `fs/read_dir` 和 `fs/write_file`，并尝试用 `fs` `read` 票据连接 `/terminal?ticket=...`。 |

## 预期结果

公共断言：任何拒绝分支均不得泄露宿主机敏感文件、容器 `/etc/passwd` 或 `x-fastgpt-agent-token` 内部口令；正常主路径文件数据在各场景之间不发生损坏。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| S1 | 存储、响应 | 无口令或错误口令访问 `ide-agent` 被拒绝（`401`/关闭连接）；损坏流返回 `500` 且已有文件完好；`../` 条目被跳过、工作区外不出现文件；软链父目录逃逸返回 `500` 且 `/tmp/pwned.txt` 不存在；`pack` 返回 `200` 且保留 `$HOME` 与缓存文件、包内不含 `lost+found`。 | 检查容器内 `/var/lib/fastgpt-runtime/.fastgpt-ide-agent-password` 权限、`/archive/pack` 与 `/archive/extract` HTTP 状态码及 `/home/sandbox`、`/tmp` 实际文件列表。 |
| S2 | 响应、容器文件 | `bad.zip` 返回 `archiveExtractionFailed` 并透传 `unzip` 错误；`evil-zipslip.zip` 的 `../` 条目被 `unzip` 跳过（容器外无逃逸文件）；`link.zip` 解压出原样软链；`good.zip` 解压成功（`nested/ok.txt` 内容一致）。 | 检查 `extractZip` 返回码、`code` 字段及容器内目录结构。 |
| S3 | 响应、响应头 | `binary.txt` 与 `nope.html` 调用 `getHtmlPreviewLink` 返回 `400`；`hello.html` 返回 `200` 且包含预览 URL；预览 `GET` 返回 `200` 并携带 `x-content-type-options: nosniff`、`referrer-policy: no-referrer`、`cache-control: private, no-store`；`HEAD binary.txt` 返回 `200` 且空响应体、含 `accept-ranges: bytes` 与 `etag`；`Range: bytes=0-3` 返回 `206`（`content-range: bytes 0-3/10`，响应体 `0123`）；无效 Range `bytes=999-1000` 返回 `416`；`lost+found` 与 `/etc/passwd` 软链接均返回 `403`/`404` 且响应不包含 `/etc/passwd` 内容。 | 记录各 HTTP 请求状态码、响应头和响应体断言结果。 |
| S4 | 响应、WebSocket JSON-RPC | `app` 申请 `terminal` 票据被拒绝；`write` WS 票据访问 `/preview/...` 返回 `4xx`；预览 `sessionId` 连接 `/fs` 握手失败；`read` 票据下 `fs/read_dir` 成功返回目录，`fs/write_file` 返回权限拒绝错误；`fs` 票据连接 `/terminal` 握手被拒绝。 | 记录 `getTicket` 返回与 `proxy` HTTP/WebSocket 握手及 JSON-RPC 响应。 |
