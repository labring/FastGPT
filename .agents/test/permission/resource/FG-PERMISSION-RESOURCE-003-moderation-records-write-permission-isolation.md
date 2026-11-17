---
case_version: 1
id: FG-PERMISSION-RESOURCE-003
title: 节点响应中内容审核记录的写权限过滤与对话详情展示隔离
business: permission/resource
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [内容审核, 权限过滤, 节点响应, WholeResponseModal, 分享链接, 断线恢复, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/global/core/chat/utils.ts
  - packages/service/core/chat/auth.ts
  - projects/app/src/service/core/workflow/nodeResponse.ts
  - projects/app/src/pages/api/v1/chat/completions.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
  - projects/app/src/pages/api/core/chat/record/getResData.ts
  - projects/app/src/pages/api/core/chat/record/getRecords_v2.ts
  - projects/app/src/pages/api/core/chat/record/getPaginationRecords.ts
  - projects/app/src/pages/api/core/chat/resume.ts
  - projects/app/src/components/core/chat/components/WholeResponseModal/ResponseRows.tsx
  - projects/app/src/web/core/plugin/admin/moderation/highlight.tsx
routes:
  - POST /api/v1/chat/completions
  - POST /api/v2/chat/completions
  - GET /api/core/chat/record/getResData
  - POST /api/core/chat/record/getRecords_v2
  - POST /api/core/chat/record/getPaginationRecords
  - GET /api/core/chat/resume
related:
  - FG-TOOL-SYSTEM-PLUGIN-001
  - FG-APP-WORKFLOW-052
  - FG-PERMISSION-RESOURCE-001
automation: []
baseline: "c915077feb8edd7cfa36fe73b49c9d00550d24a1"
---

# 节点响应中内容审核记录的写权限过滤与对话详情展示隔离

## 用例简介

工作流节点运行详情中的 `moderationRecords` 包含送审文本原文、命中标签与敏感词，仅允许拥有应用写权限（`canWrite === true`）的调用者在对话响应与历史记录中查看。本例验证在线对话（`v1`/`v2 completions`）、节点详情（`getResData`）、历史分页（`getRecords_v2`/`getPaginationRecords`）、断线续传（`resume`）及分享链接在各权限身份下的严格裁剪（含嵌套 `childrenResponses`/`pluginDetail`/`toolDetail`），并验证有写权限用户在完整响应弹窗中的多语言展示与关键词高亮。

## 前置准备

- 环境与版本：本地 dev 主应用与 Plugin 服务已启动，已启用关键词审核插件 `P_mod_a`（拦截词 `BLK_SECRET_TEXT`）。
- 身份与权限：在独立测试团队 `T` 下创建测试应用 `W`（包含顶层 AI 节点及嵌套子工作流/工具调用节点），准备 4 类调用身份：
  - `U_write`：对应用 `W` 拥有写权限（owner / manage / write，`canWrite === true`）的团队成员；
  - `U_read`：对应用 `W` 仅拥有读/对话权限（`canWrite === false`）的团队成员；
  - `S_cite`：开启「显示引用与运行详情（`showCite: true, showRunningStatus: true`）」的免登录分享链接（`outLinkAuthData`）；
  - `K_app`：绑定应用 `W` 的 API Key。
- 测试数据：通过触发 `model_input` 替换和 `output` 拦截生成两条已完成或运行中的对话记录：
  - `C_done`：AI 消息对应的节点响应树中，顶层节点及嵌套 `childrenResponses`、`pluginDetail`、`toolDetail` 均包含 `moderationRecords`（含 `content: "包含 BLK_SECRET_TEXT 的敏感原文"`、`keywords: ["BLK_SECRET_TEXT"]`、`hits: [{ label: "contraband", score: 0.95 }]`）；
  - `C_stream`：正在执行并在流镜像中产生 `flowResponses`（含 `moderationRecords`）的对话，用于验证 `resume` 实时流与已完成回退分支。
- 复位约定：`C_done` 落库后保持只读，C1～C4 对同一 `C_done` 分别以不同身份发起读取，互不污染；C5 使用独立 `C_stream` 验证断线续传。
- 验证能力：HTTP 调用上述 6 个对话与记录接口；浏览器以 `U_write` 和 `U_read` 打开对话详情「完整响应（WholeResponseModal）」；只读查询 `db.chatitemresponses.find({ chatId: C_done })` 确认底层数据库中 `moderationRecords` 完整存在。
- 关联标识：团队 `T`、应用 `W`、会话 `C_done`/`C_stream`、AI 消息 `dataId`。
- 清理方式：测试结束后删除测试应用 `W`、分享链接 `S_cite` 及关联会话数据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础（写权限用户完整可见与 UI 展示）；`U_write` 登录 | 1) 以 `U_write` 调用 `GET /api/core/chat/record/getResData`、`POST /api/core/chat/record/getRecords_v2`、`POST /api/core/chat/record/getPaginationRecords` 查询 `C_done`；2) 在浏览器以 `U_write` 打开 `C_done` 的完整响应弹窗（`WholeResponseModal`），依次切换 `zh-CN`、`en`、`zh-Hant`、`ko-KR` 四种语言查看「内容审核记录」行。 |
| C2 | 异常/边界（只读成员剥离审核记录）；`U_read` 登录 | 以 `U_read`（`canWrite === false`）调用 `getResData`、`getRecords_v2`、`getPaginationRecords` 查询 `C_done`，并在浏览器打开该消息的完整响应弹窗。 |
| C3 | 边界（分享链接公开过滤）；`S_cite`（`showCite: true`） | 携带 `outLinkAuthData`（`S_cite`）调用 `getResData`、`getRecords_v2`、`getPaginationRecords` 查询其会话中含审核记录的 AI 消息。 |
| C4 | 边界（实时对话 `v1`/`v2 completions` 权限裁剪） | 分别以 `U_write` 和 `U_read`（及 `S_cite`）调用 `POST /api/v1/chat/completions` 与 `POST /api/v2/chat/completions`（传 `detail: true` 或 `responseAllData: true`，覆盖 `stream: true` 的 `flowResponses` 事件与 `stream: false` 的 JSON `responseData`）触发含审核记录的运行。 |
| C5 | 边界（断线续传 `resume` 过滤）；`C_stream` 与 `C_done` | 分别以 `U_write`、`U_read`、`S_cite` 调用 `GET /api/core/chat/resume`（覆盖正在生成的 SSE 镜像重放流与已完成的 `findCompletedChat` 历史快照两个分支）。 |

## 预期结果

公共断言：底层 `chatitemresponses` 集合中始终完整保留原始 `moderationRecords` 供有权限者审计；任何读取操作不修改数据库中的 `moderationRecords`。对于所有 `canWrite === false` 或分享链接请求，返回树中的顶层节点、`childrenResponses`、`pluginDetail`、`toolDetail` 任意层级均不得残留 `moderationRecords` 字段或 `BLK_SECRET_TEXT` 原文。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API、UI | 三个接口返回的顶层与嵌套节点均完整包含 `moderationRecords`；UI 弹窗渲染「内容审核记录」区块，准确显示审核对象（用户输入的信息 / 传入模型的信息 / 展示给用户的信息）、审核结果、格式化命中标签与分数（如 `违禁（0.95）`）、关键词，以及截取 120 字内并对 `BLK_SECRET_TEXT` 染色高亮的内容详情；四语种切换下所有标签均为静态翻译文本，无裸 key。 | 接口 JSON 响应、四语种 `WholeResponseModal` 截图。 |
| C2 | API、UI | `U_read` 仍可正常查看允许的普通节点运行详情，但三个接口返回的顶层及所有嵌套子节点中 `moderationRecords` 均被递归剥离（`undefined`），响应体不含 `BLK_SECRET_TEXT`；UI 弹窗不渲染「内容审核记录」行。 | `U_read` 接口响应 JSON 检索、UI 弹窗截图。 |
| C3 | API | 即使分享链接开启了 `showCite: true`，`filterPublicNodeResponseData` 仍将顶层与嵌套节点的 `moderationRecords` 完全剥离，不向外部访客泄露敏感词或被审原文。 | 分享端三个接口的响应报文比对。 |
| C4 | API、SSE | `U_write` 在 `detail: true` / `responseAllData: true` 下可收到包含 `moderationRecords` 的 `responseData` 与 SSE `flowResponses`；`U_read` 与 `S_cite` 在相同参数下收到的 JSON `responseData` 与 SSE `flowResponses` 均已剥离 `moderationRecords`。 | `v1`/`v2` 流式与非流式响应报文对比。 |
| C5 | API、SSE | `resume` 在实时 SSE 重放和已完成快照两个分支中，对 `U_write` 保留 `moderationRecords`，对 `U_read` 与 `S_cite` 递归剥离 `moderationRecords`，不因断线重连绕过写权限限制。 | `resume` 接口在不同身份下的 SSE 事件流与快照数据。 |
