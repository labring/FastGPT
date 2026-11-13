---
case_version: 1
id: "FG-SKILL-DEBUGGING-001"
title: "Skill Edit 沙箱冷热启动、IDE 文件编辑与原生 WebSocket PTY 终端重连闭环"
business: "skill/debugging"
types:
  - "api"
  - "ui"
  - "e2e"
category: "basic"
scenario: "success"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/skill/debugging/FG-SKILL-DEBUGGING-001.mjs
    items: [C1, C2, C3, C4]
tags:
  - "skill"
  - "sandbox"
  - "pty"
  - "terminal"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "ui"
  - "database"
sources:
  - "projects/app/src/pages/api/core/ai/skill/runtime/init.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/getTicket.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/verifyTicket.ts"
  - "projects/opensandbox-proxy/src/terminal.ts"
  - "packages/service/core/ai/sandbox/application/pty.ts"
  - "packages/service/core/ai/sandbox/application/skillEdit/runtime.ts"
routes:
  - "POST /api/core/ai/skill/runtime/init"
  - "POST /api/proApi/core/ai/skill/debugChat"
  - "POST /api/core/ai/skill/debugChat"
  - "POST /api/core/ai/sandbox/getTicket"
  - "GET /api/core/ai/sandbox/verifyTicket"
  - "GET /terminal"
  - "POST /api/core/ai/sandbox/fs/list"
  - "POST /api/core/ai/sandbox/fs/mkdir"
  - "POST /api/core/ai/sandbox/download"
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/getFilePreviewLink"
related:
  - "FG-INFRA-RUNTIME-003"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# Skill Edit 沙箱冷热启动、IDE 文件编辑与原生 WebSocket PTY 终端重连闭环

## 用例简介

验证 Skill 调试沙箱在 OpenSandbox 架构下的完整研发与并发交互体验：通过 `POST /api/core/ai/skill/runtime/init` SSE 协议完成冷启动（下载解压包、补齐默认 `.gitignore`）与热启动幂等复用；验证已初始化完成的沙箱在左侧发起多轮 `debugChat` 调试对话的同时，右侧并发点击展开多层文件夹（`fs/list`）、读写文件（`download`/`upload`）、签发预览链接（`getFilePreviewLink`）不会触发沙箱重建或返回 `409 agentSandboxInitializing`；以及通过 `POST /api/core/ai/sandbox/getTicket` 签发短期 HS256 Ticket 直连 `opensandbox-proxy` `/terminal` WebSocket 建立原生 `execd` 二进制帧 PTY 会话与浏览器端 `/skill/detail` 页面的端到端同时操作验证。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、Pro 服务 (`127.0.0.1:3001`)、OpenSandbox Proxy (`127.0.0.1:1006`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)、MongoDB、Redis、MinIO。
- 执行方式：C1–C4 使用 Node 脚本；**C5 由 AI 使用真实 Chrome 浏览器（`/browser`）按真实入口执行**。
- 通过 `create-skill-fixture` 导入包含 `SKILL.md`、`src/helper.py`、`entrypoint.sh` 的测试 Skill，测试结束后通过 `cleanup-skill-fixture` 彻底清理 Skill、版本包与沙箱卷。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；新建 Skill | 首次调用 `POST /api/core/ai/skill/runtime/init` 触发冷启动并采集 SSE `sandboxStatus` 事件；随后再次调用 `runtime/init` 触发热启动，核对 `instanceId`、`image` 与 `claimName` 一致性。 |
| C2 | 并发与文件树；已就绪 Skill 沙箱 | 创建多层嵌套目录与文件后，在左侧发起第 1 轮与第 2 轮 `debugChat` SSE 流式调试对话的同时，并发高频调用右侧 `fs/list`（展开 `.`、`src`、`src/nested`、`src/nested/deep`、`docs`）、`download`、`upload` 与 `getFilePreviewLink`，核对所有并发请求状态与沙箱容器 `instanceId` 是否保持不变。 |
| C3 | 交互终端；已就绪 Skill 沙箱 | 调用 `POST /api/core/ai/sandbox/getTicket` 获取 `{ ticket, url, ptySessionId }`，连接 `opensandbox-proxy` WebSocket 依次发送 `resize`、`signal` (`SIGINT`) 与 `0x00` 二进制 `stdin` 命令（含创建目录文件），并并发通过 `fs/list`/`download` 读取终端产生的文件；主动断开连接后重新申请 Ticket 携带 `since: lastOffset` 重连并再次发送命令。 |
| C4 | 权限边界；已就绪 Skill 沙箱 | 使用普通 `app` 会话参数调用 `getTicket`；向 `opensandbox-proxy` `/terminal?ticket=forged` 发起伪造票据握手；为成员 `B` 授予 Skill 只读权限 (`ReadPermissionVal`) 后调用 `skill/runtime/init`、`getTicket`、`upload` 与 `debugChat`。 |
| C5 | UI 端到端；浏览器会话 | 浏览器打开 `/skill/detail?skillId=<skillId>`，等待沙箱初始化完成，在左侧发起调试对话的同时在右侧连续点击展开文件夹、切换查看文件并操作终端面板。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 冷启动 SSE 正常推送状态并创建 `sourceType='skillEdit'` 的运行态实例与持久卷；热启动复用同一 `sandboxId`、`instanceId` 与 `claimName`。 | SSE 事件序列与 Mongo 实例记录。 |
| C2 | 工作区自动补齐 `.gitignore`；左侧两轮 `debugChat` 流式进行期间，右侧并发展开多层目录（`fs/list`）、读写文件与预览全部返回 `200`，零 `409 agentSandboxInitializing` 报错，且沙箱容器 `instanceId` 全程不变（未发生销毁重建）。 | 并发请求结果、聊天流事件与 Mongo `instanceId` 前后对比。 |
| C3 | 首次连接签发 `ptySessionId`，二进制输出帧（`0x01`/`0x02`/`0x03`）解码匹配且终端创建的文件在 IDE 文件树即时可见；断线后携带 `since` 重连返回 `reused: true`、复用同一 `ptySessionId` 并正常接收新输出。 | PTY 票据、WebSocket 输出偏移量与文件树读取响应。 |
| C4 | 非 `skillEdit` 会话调用 `getTicket` 被拒绝；伪造 Ticket 握手在代理边缘返回 `401`；仅具只读权限的成员调用初始化、终端票据、写文件或调试对话接口均被拒绝。 | 权限、票据与会话类型拒绝响应。 |
| C5 | `/skill/detail` 页面沙箱就绪后，左侧发起对话不会触发重新创建容器，且对话进行中右侧点击展开文件夹、打开文件与终端交互全部正常无报错。 | Chrome 页面截图、网络请求记录与 DOM 观察记录。 |
