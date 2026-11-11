---
case_version: 1
id: FG-APP-WORKFLOW-052
title: 工作流与 Agent 在入口、模型输入和最终输出三阶段的内容审核拦截与替换
business: app/workflow/execution
types: [api, ui, e2e, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [内容审核, 工作流执行, Agent, 流式截断, 工具参数审核, 审核记录, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/global/core/plugin/moderation/constants.ts
  - packages/global/core/plugin/moderation/type.ts
  - packages/service/core/plugin/moderation/checker.ts
  - packages/service/core/plugin/moderation/collector.ts
  - packages/service/core/plugin/moderation/entry.ts
  - packages/service/core/plugin/moderation/modelInput.ts
  - packages/service/core/plugin/moderation/output.ts
  - packages/service/core/plugin/moderation/record/schema.ts
  - packages/service/core/plugin/moderation/record/entity.ts
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/utils/runtime.ts
  - packages/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion.ts
  - packages/service/core/workflow/dispatch/ai/agent/index.ts
  - packages/service/core/workflow/dispatch/ai/toolcall/index.ts
  - packages/service/core/workflow/dispatch/ai/readFiles.ts
  - packages/service/core/workflow/dispatch/dataset/search.ts
  - packages/service/core/workflow/dispatch/tools/readFiles.ts
  - packages/service/core/workflow/dispatch/tools/answer.ts
  - packages/service/core/workflow/dispatch/tools/queryExternsion.ts
  - packages/service/core/workflow/dispatch/interactive/userSelect.ts
  - packages/service/core/workflow/dispatch/interactive/formInput.ts
  - packages/service/core/ai/llm/request/createLLMResponse.ts
  - packages/service/core/ai/llm/agentLoop/provider/piAgent/run.ts
  - packages/service/core/ai/llm/agentLoop/provider/piAgent/tool/build.ts
routes:
  - POST /api/v1/chat/completions
  - POST /api/v2/chat/completions
  - POST /api/core/plugin/admin/moderation/policy
  - POST /api/core/plugin/admin/moderation/records
related:
  - FG-TOOL-SYSTEM-PLUGIN-001
  - FG-PERMISSION-RESOURCE-003
automation: []
baseline: "c915077feb8edd7cfa36fe73b49c9d00550d24a1"
---

# 工作流与 Agent 在入口、模型输入和最终输出三阶段的内容审核拦截与替换

## 用例简介

启用全局内容审核策略后，工作流与 Agent 在信息接入平台（`entry`）、信息进入模型（`model_input`）及最终输出（`output`）三个阶段按策略执行阻断或脱敏替换，并将审查事件异步持久化到 `system_moderation_records`。本例验证入口阻断不消耗模型 Token、系统变量与历史上下文免审、模型输入违规替换与必需输入阻断、流式滑动窗口截断，以及普通工具与控制工具（`ask`/`plan`）参数违规时正确归类为节点错误而非正常完成。

## 前置准备

- 环境与版本：本地 dev 主应用与 Plugin 服务已启动，已按 `FG-TOOL-SYSTEM-PLUGIN-001` 安装并启用受控关键词审核插件 `P_mod_a`：配置确定性触发词 `BLK_WORD`（返回 `verdict: 'block'`）、`SUS_WORD`（返回 `verdict: 'suspected'`）和 `ERR_WORD`（返回 `verdict: 'error'`）。
- 身份与权限：新建独立测试团队 `T`、团队管理员 `A` 及有效应用 API Key `Ka`。
- 测试数据：在团队 `T` 下准备受控测试应用：
  - `W_chat`：含自定义全局变量 `customVar`、知识库检索、文档读取（`readFiles`）、AI 对话、指定回复（`answerNode`）、用户选择（`userSelect`）、表单输入（`formInput`）与猜你想问（`queryExtension`）的工作流，并为 AI/Agent 节点配置异常捕获连线（error branch）。
  - `W_agent`：启用普通工具 `T_echo`、内置文件读取 `read_files`、以及控制工具 `ask_user` / `set_plan` 的 Agent / ToolCall 应用。
  - 准备两条知识库切片 `Q_safe`（正常文本）与 `Q_blk`（含 `BLK_WORD`），以及两个可读取的文本文件 `F_safe.txt` 与 `F_blk.txt`（含 `BLK_WORD`）。
- 复位约定：默认策略基线 `P0` 为 `enabled: true`，`userInput: true, modelInput: true, finalOutput: true`，`streamInterval: 20`，`suspectedRiskAction: 'blockAndLog'`，`serviceExceptionAction: 'pass'`。每个子场景按表中说明切换策略开关后独立发起新 `chatId`，执行后恢复 `P0`。
- 验证能力：HTTP 调用 `v1/v2 chat/completions`（覆盖 `stream: false` 与 `stream: true`）；只读查询 `db.system_moderation_records.find({ teamId: T, chatId })`、`db.chatitems.find({ chatId })` 及 `db.chatitemresponses.find({ chatId })`。
- 关联标识：测试团队 `T`、应用 `W_chat`/`W_agent`、各子场景独立 `chatId` 与请求头 `x-request-id`。
- 清理方式：测试结束后删除本轮创建的测试应用、知识库、文件记录及 `system_moderation_records` 中属于 `T` 的记录，恢复全局审核策略。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 异常（入口拦截）；策略 `P0` | 1) 向 `W_chat` 发送包含 `BLK_WORD` 的用户 `query`；2) 发送正常 `query`，但在自定义变量 `variables.customVar`（或交互表单提交值）中传入 `BLK_WORD`；3) 发送正常 `query` 与正常 `customVar`，但 `histories`（历史消息）或系统变量字段（`cTime`/`userId`/`appId`/`chatId`）带有历史文本。 |
| C2 | 边界（模型输入替换与阻断）；仅开启 `hooks.modelInput: true`（关闭 `userInput`） | 1) 运行 `W_chat`：传入正常 `userChatInput`，但节点 `systemPrompt` 含 `BLK_WORD`、知识库检索召回 `[Q_safe, Q_blk]`、文件读取传入 `[F_safe.txt, F_blk.txt]`；2) 传入含 `BLK_WORD` 的 `userChatInput` 给 AI 对话 / ToolCall / Agent 节点。 |
| C3 | 基础（Agent 内部工具结果与文件读取替换）；开启 `hooks.modelInput: true` | 运行 `W_agent`：1) 让模型调用内置 `read_files` 同时读取 `[F_safe.txt, F_blk.txt]`；2) 让模型调用普通工具 `T_echo`，工具返回含 `BLK_WORD` 的结果字符串，观察 Agent 后续规划与完成状态。 |
| C4 | 异常（非流式输出与交互节点拦截）；仅开启 `hooks.finalOutput: true` | 以 `stream: false` 运行 `W_chat`：分别触发 AI 对话输出、`answerNode` 回复、`userSelect` 选项、`formInput` 提示/选项、`queryExtension` 输出包含 `BLK_WORD`。 |
| C5 | 边界（流式分块输出截断）；仅开启 `hooks.finalOutput: true, streamInterval: 20` | 以 `stream: true` 运行 `W_chat` / `W_agent`：让模型先流式输出 25 个正常字符（超过第一个 20 字符窗口），随后在第二段输出或思考链（`reasoning`）中生成 `BLK_WORD`，后续还有剩余文本。捕获完整 SSE 事件流与最终落库消息。 |
| C6 | 边界（工具调用参数违规脱敏回传与 Loop 续跑）；仅开启 `hooks.finalOutput: true` | 在 `W_agent`（覆盖普通 Agent Loop 与 PiAgent provider）中：1) 模型生成调用普通工具 `T_echo` 且参数含 `BLK_WORD`；2) 模型生成调用控制工具 `ask_user` 或 `set_plan` 且参数含 `BLK_WORD`。检查底层工具是否执行、SSE 事件、客户端是否出现报错卡片及 Agent Loop 后续运行状态。 |
| C7 | 边界（策略切换与异常降级）；基于 `P0` 切换策略 | 1) 将 `suspectedRiskAction` 分别设为 `blockAndLog` 与 `passAndLog`，输入含 `SUS_WORD` 的请求；2) 将 `serviceExceptionAction` 分别设为 `pass` 与 `block`，触发 `ERR_WORD`（插件返回 `verdict: 'error'`）或模拟插件运行时不可用；3) 将总开关 `policy.enabled` 设为 `false`，再次发送含 `BLK_WORD` 的请求。 |

## 预期结果

公共断言：每次触发审查后（最长等待 5 秒异步落库），`system_moderation_records` 新增对应记录，准确包含 `teamId`、`tmbId`、`appId`、`chatId`、`stage`、`targetField`、`content`、`pluginId`、`provider`、`verdict`、`actionTaken`（`pass`/`block`/`replace`）与 `duration`。被拦截或替换的节点在 `chatitemresponses` 的节点详情中记录 `moderationRecords`（且同一判定结果不重复追加）。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API、UI、数据库 | 1) 和 2) 在进入 `preChatRound` 与工作流节点执行前立即抛出 `UserError("内容包含敏感信息，已拦截")`，不调用 LLM、不产生模型 Token 计费、不落库 `chats` / `chatitems` / `chatitemresponses`（仅在 `system_moderation_records` 记录 `stage: 'entry', targetField: 'query' | 'variable.customVar', actionTaken: 'block'`），前端弹出 Toast 提示、回滚占位消息并保留输入内容；3) 系统变量键（`userId`/`appId`/`chatId`/`responseChatItemId`/`histories`/`cTime`）被跳过免审，请求正常通过。 | HTTP/SSE 错误响应、前端 Toast 与消息列表状态、账单 usage 查询、`chats`/`chatitems` 空记录验证及 `system_moderation_records`。 |
| C2 | API、数据库 | 1) 违规的 `systemPrompt`、`Q_blk` 内容及 `F_blk.txt` 正文被替换为 `"该信息因内容审核不通过，无法返回"`（`actionTaken: 'replace'`），同批正常的 `Q_safe` 与 `F_safe.txt` 原文完整保留，节点继续调用模型完成回答；2) 当必需的 `userChatInput` 被拦截时，节点不发起模型调用，直接返回节点错误（可走工作流错误捕获分支）。 | 模型实际接收上下文/节点详情快照、`system_moderation_records` 中 `actionTaken: 'replace' | 'block'` 记录。 |
| C3 | API、数据库 | 1) `dispatchWorkflowReadFiles` 逐文件审查：`F_blk.txt` 的 `content` 替换为 `"该信息因内容审核不通过，无法返回"`，`F_safe.txt` 保持原文；2) 工具返回结果违规时被替换为同一脱敏提示回传给模型，不中断 Agent Loop，Agent 正常完成后续回复。 | Agent 工具响应 JSON、节点响应详情、`system_moderation_records`（`targetField: 'file.F_blk.txt' | 'toolResult'`）。 |
| C4 | API、数据库 | 所有面向用户的非流式输出命中违规时均被阻断，不向客户端返回违规文本、`userSelect` 选项或 `formInput` 表单交互，也不生成假空问题列表。 | 各节点触发后的响应报文与 `chatitems` 落库内容。 |
| C5 | SSE、数据库 | 第一段已通过审核的 20 字符正常推送 `answer_delta`；当累计前缀出现 `BLK_WORD` 时，流式缓冲器立即触发 `abortController.abort()` 停止生成，后续含敏感词及未展示的增量绝不通过 SSE 发送给客户端；同一流式窗口复用相同 `sessionId` 且流中 `partial: true`、收尾 `partial: false`；已发生的模型 Token 用量正常保留。 | SSE 原始事件序列、最终 `chatitems` 消息内容、`system_moderation_records`。 |
| C6 | API、SSE、数据库 | 无论普通工具还是 `ask_user`/`set_plan`，参数违规时底层工具均不执行、不向客户端流式暴露原始敏感 `toolParams` 或进入 `agentAsk` 暂停状态；当前工具调用统一以 `"该信息因内容审核不通过，无法返回"` 回填给模型，不阻断整个 Agent Loop，客户端气泡与节点运行详情均不产生节点 `error`/`errorText` 报错横幅，由 Agent Loop 自主决定继续调用或结束。 | 工具调用计数、SSE 事件流、节点响应详情（无 `error`/`errorText`）及 Agent 最终完成回复。 |
| C7 | API、数据库 | 1) `SUS_WORD` 在 `blockAndLog` 下拦截、在 `passAndLog` 下放行，两者均写入 `verdict: 'suspected'` 审计记录；2) `ERR_WORD` 或插件异常在 `serviceExceptionAction: 'pass'` 下放行（`actionTaken: 'pass'`），在 `'block'` 下阻断并返回 `"内容审核异常，已拦截"`（区分于内容违规提示）；3) 总开关关闭后不发起任何插件审查调用、不产生新的 `system_moderation_records`。 | 各策略下的响应文案、`POST /api/core/plugin/admin/moderation/records` 返回结果及数据库记录差集。 |
