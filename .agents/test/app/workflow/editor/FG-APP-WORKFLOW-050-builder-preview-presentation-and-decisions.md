---
case_version: 1
id: FG-APP-WORKFLOW-050
title: Builder 方案概述展示与预览决策恢复
business: app/workflow/editor
types: [ui, api, e2e, integration]
category: basic
scenario: success
priority: P1
status: ready
tags: [workflow-builder, preview, summary, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/ChatPanel.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api.ts
  - packages/global/openapi/core/workflow/builder/api.ts
  - pro/admin/src/pages/api/core/workflow/builder/chat.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
  - pro/admin/src/service/core/ai/workflowBuilder/previewTool.ts
  - pro/admin/src/service/core/ai/workflowBuilder/runner.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/service.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/entity.ts
  - packages/global/core/workflow/builder/type.ts
  - packages/global/core/workflow/builder/utils.ts
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/chatItemSchema.ts
  - projects/app/src/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview.tsx
  - projects/app/src/components/core/chat/components/AIResponseBox/WorkflowBuilder/WorkflowBuilderPreviewComposer.tsx
routes:
  - POST /api/proApi/core/workflow/builder/chat
related: [FG-APP-WORKFLOW-051]
baseline: "8d720653d46a46dffb076490ca9fd545307a3413"
---

# Builder 方案概述展示与预览决策恢复

## 用例简介

用户在工作流编辑器中让 Builder 提出搭建方案，应先读到标题和简短概述，再查看流程图及配置说明。用户可以修改或取消方案；重新打开会话后，已有方案和实际回答应完整恢复，升级前没有概述的方案也应可阅读。

## 前置准备

- 记录主站 BASE_URL、实际主仓及 Pro 版本；当前配套 Pro 基线为 `91d04ff7cc35a61cde7a39008115742964c03021`。确认本地 dev 主站和 Pro 来自上述源码，功能开关、模型目录、Agent Sandbox 和对象存储可用；模型和沙箱配置不足是执行阻塞，不能用 mock 单测替代真实结果。
- 使用有工作流创建、编辑、Builder 对话和删除权限的测试账号。新建名称以 `FG-TEST-preview-<RUN>` 开头的临时工作流，记录 teamId、tmbId、appId 和各场景 chatId；只使用本轮生成的内容，不发送真实业务数据。
- D0：只有开始节点的独立画布，导出配置为 W0。通过实际 AI 搭建入口新建 Builder 会话，提出明确的“接收问题并固定回复测试标识”的简单方案，要求先展示方案等待确认。生成最长等待 180 秒，以真实待确认交互和请求结束为判据。
- D1：独立新会话，输入为 D0 的方案加“返回结果后附加固定结束语”的修改意见。C1 与 C2 连续执行；C3 在新的待确认会话执行，避免取消污染修订会话。
- C4 的历史兼容夹具只允许写入本轮 marker 保护的私有数据库，不能改共享 dev 的既有记录。在该私有实例为本轮临时 app 创建合法的 `workflowBuilder` 会话、Human/AI 记录与任务 metadata；预览原始 arguments 只有 title、mermaid、sections，preview checksum 为升级前相同内容的固定摘要。记录并验证实例 marker、精确资源范围及夹具原文。缺少私有实例时仅阻塞 C4，其他场景继续。
- UI 与接口取证：保存真实 Builder POST 的脱敏消息结构和 SSE，浏览器中读取可见标题、概述、图像和章节；确认区使用“确认并开始搭建 / 修改方案 / 取消本次搭建”。只读查询按 teamId、appId、sourceType=workflowBuilder、chatId 限定 `chats` 和 `chatitems`，保存原始 `interactive.params.arguments` 与 `metadata.workflowBuilderTask.preview`。
- 复位与清理：每次独立操作使用新 chatId；修改场景承接同一任务。完成后经正常会话/应用删除入口回收本轮资源，并确认没有生成仍在运行；不应用到业务画布、不发布应用、不修改用户已有应用。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | 在真实 Builder 页面发送上述需求，等待完整方案。比对工具原始参数、持久化记录和页面的标题、概述、流程图、章节顺序。记录 W0 与当前画布。 |
| C2 | 基础；承接 C1 | 选择“修改方案”，提交 D1 修改意见。等待新方案，核对概述和章节表达修改结果、只有新方案待确认，随后刷新并重新打开同一会话。 |
| C3 | 基础及拒绝执行；新 D0 的待确认方案 | 选择“取消本次搭建”，等待本轮结束，再刷新。核对独立 Human 选择记录、取消答复、任务事实和 W0。 |
| C4 | 历史兼容；私有历史夹具 | 在真实编辑页恢复无 summary 的待确认方案，读取图与章节，再通过正常 UI 取消并刷新。按夹具的原始摘要核对任务身份。 |

## 预期结果

公共断言：工具正文是模型生成内容，固定标签来自当前语言；新预览包含非空概述，旧预览不补写默认概述。生成方案及取消都不能应用、保存或发布新画布；修改只修订方案。接口 HTTP 状态、SSE 终态、页面及持久化事实联合判断；不将 mock、源码阅读或历史报告作为本轮通过证据。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、SSE、只读 Mongo | 标题 → 非空 summary → “流程预览”与实际 Mermaid 图 → 直接展示的 sections；当前卡片有“待确认”。arguments 原文持久化，解析内容与页面一致；画布仍为 W0，无候选被自动应用。 | 截图、脱敏 SSE、参数原文与数据库记录、导出 W0/当前配置。 |
| C2 | UI、SSE、只读 Mongo | 修改意见保存在独立 Human；新方案明确包含结束语，新旧预览分别保留；仅新预览待确认。刷新不重复发送、不丢原文，任务 previewId/checksum 指向修订方案。 | 修改请求、两个预览参数、刷新后 DOM/截图、任务 metadata 与消息 ID 序列。 |
| C3 | UI、SSE、只读 Mongo | Human select 为 workflowBuilderPreview/cancel；出现“已取消本次搭建。”，确认区和待确认标记消失，刷新不复活。没有新候选或画布变化；不要求抹除已经产生的模型用量。 | 请求及 select、取消 SSE、刷新截图、任务和版本/画布差集。 |
| C4 | UI、正常取消接口、私有 Mongo | 无概述仍显示标题、原图及章节，无裸 key 或页面错误；原 arguments 不增加 summary，确认身份仍能识别并完成取消，不能因升级而要求重建方案。 | 私有 marker 证明、夹具与原始摘要、恢复/取消/刷新截图及对应精确记录。 |
