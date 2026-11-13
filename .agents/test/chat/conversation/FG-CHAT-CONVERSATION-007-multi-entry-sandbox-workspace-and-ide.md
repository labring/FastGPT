---
case_version: 1
id: "FG-CHAT-CONVERSATION-007"
title: "多入口对话沙箱工作区 IDE 文件树、大文件降级、乐观并发锁与上传下载闭环"
business: "chat/conversation"
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
    script: .agents/test/chat/conversation/FG-CHAT-CONVERSATION-007.mjs
    items: [C1, C2, C3]
tags:
  - "sandbox"
  - "workspace"
  - "ide"
  - "etag"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "ui"
  - "storage"
sources:
  - "projects/app/src/pages/api/core/ai/sandbox/fs/list.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/fs/mkdir.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/fs/move.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/fs/delete.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/fs/exec.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/upload.ts"
  - "projects/app/src/pages/api/core/ai/sandbox/download.ts"
  - "projects/app/src/pageComponents/chat/SandboxEditor/hook.tsx"
routes:
  - "POST /api/core/ai/sandbox/fs/list"
  - "POST /api/core/ai/sandbox/fs/mkdir"
  - "POST /api/core/ai/sandbox/fs/move"
  - "POST /api/core/ai/sandbox/fs/delete"
  - "POST /api/core/ai/sandbox/fs/exec"
  - "POST /api/core/ai/sandbox/upload"
  - "POST /api/core/ai/sandbox/download"
related:
  - "FG-INFRA-RUNTIME-002"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# 多入口对话沙箱工作区 IDE 文件树、大文件降级、乐观并发锁与上传下载闭环

## 用例简介

`chore/opensandbox` 分支将 IDE 文件与目录操作统一收口为主站 `/api/core/ai/sandbox/fs/*` 目录管理与 `upload`/`download` 原始字节流协议。本用例覆盖 IDE 文件全套 CRUD 与二进制流上传/ZIP 打包下载、基于 `oldEtag` 的乐观并发冲突拦截、>5MB 大文件流式下载与编辑器只读策略、多对话入口（App 登录态、分享链接 `outLinkAuthData`、OpenAPI Key）权限一致性，以及浏览器端打开「查看虚拟机文件」弹窗浏览代码与编辑保存的完整闭环。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)。
- 执行方式：C1–C3 使用 Node 脚本；**C4 由 AI 使用真实 Chrome 浏览器（`/browser`）按真实入口执行**。
- 复用 `appKeyWorld` 创建独立测试应用 `W` 并开启 Agent 沙箱能力；浏览器场景创建临时应用与会话并在结束后完整回收。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；独立会话 | 依次调用 `fs/mkdir` 创建 `src/utils`、`upload` 写入 `src/index.ts` 与二进制 `assets/logo.bin`、`fs/list` 单层懒加载列目录、`download` 读取单文件内容与 `ETag`、`fs/move` 重命名、`download` 下载目录 ZIP 包、`fs/delete` 删除文件。 |
| C2 | 边界与异常；独立会话 | 先通过 `upload` 写入 `note.md` 获得 `etag1`，更新文件产生 `etag2`，随后携带旧 `oldEtag: etag1` 调用 `upload`；接着测试超限 `Content-Length` 上传、`fs/move` 移动到已存在目标路径、向已存在目录 `empty-dir` 上传文件、下载空目录 ZIP 与不存在的文件；最后通过 `fs/exec` 生成 6MB 文件 `large.bin` 调用 `download` 流式读取。 |
| C3 | 多入口权限；独立会话 | 分别从 App 登录态、OpenAPI Key (`customUid`)、免密分享链接 (`outLinkAuthData`) 访问沙箱工作区，验证分享链接只读允许（`checkExist`/`fs/list`/`download`）与写操作拒绝（`upload`/`fs/mkdir`/`fs/move`/`fs/delete`/`fs/exec`）。 |
| C4 | UI 端到端；浏览器会话 | 在浏览器打开包含沙箱产物的应用对话页，点击右上角「查看虚拟机文件」按钮打开 `SandboxEditorModal` 弹窗，核对文件树渲染、点击打开 `hello.py` 查看代码内容并关闭弹窗。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 全套 `fs/*` 操作与 `upload` 成功；单文件 `download` 原样返回字节流与 `ETag`，目录 `download` 返回合法 ZIP 且包含所有子文件，删除后从列表消失。 | 各接口响应、ZIP 解压条目列表。 |
| C2 | 携带过期 `oldEtag`、超限大小、目录同名路径的写入以及移动到已存在目标路径均被拦截且不破坏原文件；携带最新 `etag2` 保存成功；空目录返回合法空 ZIP、缺失文件下载报错；6MB 文件通过 `download` 完整流式读出 6MB 并返回 `ETag`。 | 冲突与边界拒绝响应、6MB 下载字节数。 |
| C3 | 登录态与 OpenAPI Key 具备完整读写能力；免密分享链接访客可正常列目录、下载读取文件，所有写接口均被 `WritePermissionVal` 拦截。 | 多入口读写响应对比。 |
| C4 | 对话页自动探测 `checkExist` 并渲染「查看虚拟机文件」入口，点击后弹出「虚拟机文件」模态框，文件树展示 `hello.py`，点击后编辑器区渲染对应代码文本。 | Chrome 页面与模态框截图及 DOM 观察记录。 |
