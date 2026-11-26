---
case_version: 1
id: FG-APP-WORKFLOW-052
title: Builder 确认前收齐事实与确认后自主修复交付
business: app/workflow/editor
types: [ui, api, e2e, integration]
category: basic
scenario: success
priority: P1
status: ready
tags: [workflow-builder, confirmation, repair, candidate, 覆盖基础场景, 覆盖异常场景]
evidence: [ui, response, database, storage]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api.ts
  - packages/global/openapi/core/workflow/builder/api.ts
  - pro/admin/src/pages/api/core/workflow/builder/chat.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
  - pro/admin/src/service/core/ai/workflowBuilder/prompt.ts
  - pro/admin/src/service/core/ai/workflowBuilder/runner.ts
  - pro/admin/src/service/core/ai/workflowBuilder/cli/schema.ts
  - pro/admin/src/service/core/ai/workflowBuilder/cliGateway.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/service.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/entity.ts
  - pro/admin/src/service/core/ai/workflowBuilder/version/service.ts
  - packages/service/core/ai/llm/agentLoop/provider/fastAgent/loop/base.ts
  - packages/service/core/ai/llm/agentLoop/provider/piAgent/run.ts
routes:
  - POST /api/proApi/core/workflow/builder/chat
  - POST /api/proApi/core/workflow/builder/version/load
related: [FG-APP-WORKFLOW-050, FG-APP-WORKFLOW-053]
baseline: "7299d5765d8a5859e98ecc20d095cca43c1bc542 + 工作区；Pro 0590cf494fda1f3304904e98f8f36f8a6b9a230e + 工作区"
automation:
  - runner: node
    script: .agents/test/app/workflow/editor/workflow-builder.integration.mjs
    items: [C3, C4]
---

# Builder 确认前收齐事实与确认后自主修复交付

## 用例简介

用户要求先审阅方案时，Builder 应在确认前收齐必要业务事实；用户确认后应连续搭建、校验和交付候选。JSON、工具参数及工作流诊断错误由 Agent 自主修复，不能把可修复的技术问题变成新一轮业务提问或提前结束。本例只使用本次代码创建的新会话和任务，不验证旧版本数据兼容。

## 前置准备

- 记录 BASE_URL、实际运行主站/Pro 的源码目录、commit、工作区差异摘要、当前 AgentLoop provider 和实际 `modelId`；展示名称不能代替 `modelId`。主站、Pro、Mongo、Redis、Agent Sandbox、CLI 和候选归档所用对象存储必须真实可用。
- 使用有创建、编辑和删除工作流权限的测试成员。仅新建 `FG-TEST-builder-<RUN>` 应用及专用 chatId，记录 teamId、tmbId、appId、responseChatItemId。D0 为开始节点连接指定回复节点、回复 `FG-TEST baseline` 的有效画布；导出并保存 W0，后续需求只改回复文本，应用名称、简介和其他配置保持原值。
- C1/C2 使用真实已配置模型和真实页面交互，模型连通性先通过模型管理实际测试入口核验。不能用脚本化模型证明模型遵守提示词；真实模型不可用时记录这两项阻塞，继续可独立运行的接口场景。
- C3/C4 使用两个独立的新待确认任务。可以为本轮创建 `FG-TEST-<RUN>` 专用模型及受控 HTTP 上游，用固定工具调用稳定注入错误；只替代模型输出，浏览器/API、后端、数据库、Sandbox、CLI 和 S3 不替代。报告注明替代范围，不能将其判定推广为真实模型自主决策能力。每个变体恢复独立 D0 和新 chatId，不修改既有模型、默认模型或全局配置。
- 关联证据：保存 Builder POST 的脱敏输入、SSE 完整事件和消息顺序；通过 teamId/tmbId/appId/sourceType=`workflowBuilder`/chatId 限定只读查询 `chats`、`chatitems`，核对 `metadata.workflowBuilderTask`、`metadata.workflowBuilderTasks` 及 AI 的 tools、interactive、workflowBuilderVersion。版本通过实际 version/load API 读取并比对候选文档，不只看 SSE 提示。
- 每轮最长等待 240 秒，以请求结束、交互或版本事件和实际持久化结果共同判定。超时先查生成状态，必要时通过正常停止入口终止本轮，再决定失败或环境阻塞；不得盲目重复确认或提交。
- 清理本轮专用会话、应用、模型及受控上游，检查后台生成已结束；保留脱敏证据，不应用到用户已有画布、不发布应用。C1/C2 只验证候选生成，不点击应用按钮。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；真实模型、新 D0 | 从“AI 生成工作流”入口要求“把指定回复改为我提供的固定文本；文本尚未给出，请先询问，资料齐后先展示方案等待确认”。观察必要事实澄清；回答固定文本 `FG-TEST-<RUN>-accepted` 并明确无外部接口、知识库或其他业务选择，等待待确认方案。记录两次真实请求和 UI，不点击确认。 |
| C2 | 基础；连续承接 C1 | 点击真实确认按钮，等待同一轮完成搭建、校验、候选归档和最终答复，不再提供用户输入。通过 version/load 读取候选，刷新并恢复当前会话，核对版本和确认区；再次导出当前画布与 W0 比较。 |
| C3 | 异常；每个变体独立新预览并正常确认 | 参数矩阵为不可解析/缺损 JSON，以及可解析但 chunk/commands 类型不符合契约。受控上游先返回对应错误 stage 调用，读取真实错误结果后再返回正确的同一业务变更，依次 draft validate、用实际 draftRevision commit、最终答复。每个变体仅确认一次。 |
| C4 | 异常；独立新预览并正常确认 | 返回合法 JSON，但暂存包含不存在的节点/引用或不可写配置路径，取得真实领域诊断。按诊断修正同一个 chunkId，重新检查和 validate；仅使用修复后最新有效 draftRevision 提交并结束。保留失败输入、修复输入和两次诊断。 |

## 预期结果

公共断言：确认后的每项成功链路都存在真实 stage、最新有效 validate、commit 和可靠归档版本；没有候选被自动应用或发布。修复可以产生额外模型/工具用量，不要求费用为零。结构有效不替代需求核对；候选中的回复文本必须为本场景 marker，原有节点、其他配置和业务能力保持要求的差集。C1/C2 必须有 UI、真实模型、SSE 和持久化联合证据；C3/C4 以真实接口及服务协作为验收，不要求其脚本化模型证明提示词遵循性。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、真实模型、SSE、Mongo | 缺固定文本时先出现必要事实澄清，没有候选或提前要求确认；回答后方案包含给定 marker 并等待真实接受。W0 未改变，未确认前无 commit/候选版本。 | 两轮输入、交互事件、待确认截图、限定查询的消息/任务记录和 W0。 |
| C2 | UI、API、SSE、Mongo、S3 版本读取 | 一次确认后连续完成候选；期间没有新的 agentAsk、待确认预览或正文追问，没有以阶段总结替代交付。任务 delivery.version、消息版本和 SSE 版本一致；version/load 返回的文档满足 marker，刷新后可恢复，画布仍为 W0。 | 确认后的完整 SSE/工具顺序、版本读取响应、任务/消息快照、刷新截图及画布差集。 |
| C3 | API、SSE、Mongo、真实 Sandbox/CLI/S3 | 两个参数变体均先得到明确失败工具结果，再修正并交付；失败调用不能产生成功提交。无追加确认/Ask；最终只有本次业务候选，无遗留错误变更或重复 chunk。 | 各变体受控上游请求、原始工具参数与结果、CLI 状态、持久化版本和 version/load 文档。 |
| C4 | API、SSE、Mongo、真实 Sandbox/CLI/S3 | 首次出现可定位的领域诊断；修复后 state=valid，commit 使用该轮 draftRevision。修复没有删除业务必需结构来规避校验；未提交包含无效引用/配置的候选，不因初次诊断结束搭建。 | 两次变更/诊断、有效修订号、commit 与归档响应、候选文档和精确变更差集。 |
