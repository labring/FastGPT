---
case_version: 1
id: FG-APP-WORKFLOW-053
title: Builder 新任务记忆隔离与压缩恢复
business: app/workflow/editor
types: [api, e2e, integration]
category: boundary
scenario: special
priority: P1
status: ready
tags: [workflow-builder, task-memory, checkpoint, sandbox, isolation, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, storage]
sources:
  - packages/global/openapi/core/workflow/builder/api.ts
  - pro/admin/src/pages/api/core/workflow/builder/chat.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
  - pro/admin/src/service/core/ai/workflowBuilder/runner.ts
  - pro/admin/src/service/core/ai/workflowBuilder/prompt.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/entity.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/service.ts
  - pro/admin/src/service/core/ai/workflowBuilder/task/storage.ts
  - pro/admin/src/service/core/ai/workflowBuilder/sandbox/workspace.ts
  - packages/service/core/ai/llm/compress/index.ts
  - packages/service/core/ai/llm/agentLoop/provider/fastAgent/loop/base.ts
  - packages/service/core/ai/llm/agentLoop/provider/piAgent/run.ts
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/global/core/chat/adapt.ts
  - sdk/sandbox-adapter/src/contracts/filesystem.ts
  - sdk/sandbox-adapter/src/polyfills/command-filesystem.ts
routes:
  - POST /api/proApi/core/workflow/builder/chat
  - POST /api/proApi/core/workflow/builder/version/load
  - POST /api/v2/chat/stop
related: [FG-APP-WORKFLOW-052, FG-APP-WORKFLOW-050]
baseline: "7299d5765d8a5859e98ecc20d095cca43c1bc542 + 工作区；Pro 0590cf494fda1f3304904e98f8f36f8a6b9a230e + 工作区"
automation:
  - runner: node
    script: .agents/test/app/workflow/editor/workflow-builder-memory.integration.mjs
    items: [C1, C2, C3, C4]
---

# Builder 新任务记忆隔离与压缩恢复

## 用例简介

同一 Builder 会话可以先后承接多个任务；完整需求、方案和草稿应各自保存，切回未完成任务时只继续该任务。上下文压缩后应保留稳定的恢复入口，执行资格仍以服务端真实确认、取消和交付事实为准。本例所有任务与签名快照均由本次代码创建，不构造旧版本记录或迁移夹具。

## 前置准备

- 复用 FG-APP-WORKFLOW-052 已核实的真实主站、Pro、Mongo、Redis、Sandbox、CLI、对象存储和权限准备，每个子场景新建本轮独立应用/会话。记录实际 provider 和模型 ID；未执行的 provider 不宣称覆盖。只读证据与故障注入均限定本轮 teamId、tmbId、appId、chatId、taskId。
- D0 为开始节点连接指定回复的有效画布 W0；任务 A、B 分别修改回复或 welcomeText 为不同的 `FG-TEST-<RUN>-A/B` 标识。需要保留未完成草稿时，在真实 stage 成功后使用正常停止入口结束当前生成，等待会话不再生成再进入下一轮，不能伪造成功交付。
- 文件通过当前会话 Sandbox 的真实文件接口或 `sandbox_read_file` 读取：`task-memory/index.json`、`tasks/<实际目录>/task.json`、`request.md`、`requests/` 和 plans 中实际引用的文件。目录从真实索引/工具结果取得，不能把 taskId 原样当目录名。保存原始字节及 SHA-256；带签名文件按 envelope 的 payload 读取，密钥不得进入模型或报告。
- C1 原始需求使用超过 200 字、但可完整读取的确定文本，在开头、中部和末尾放不同 marker；两个后续修订分别使用唯一 responseChatItemId。新预览任务依照正常预览与确认流程创建，直接执行任务使用本轮明确业务指令；两种任务均属于新逻辑。
- C3 可创建本轮专用、较小 maxContext 的临时模型和受控 HTTP 上游，注入足以超过实际压缩阈值的确定性历史并返回格式合法的摘要。只替代模型回复，不替代 compressRequestMessages、provider、ChatItem 存储或 Sandbox。使用上游实际收到的请求和落库 checkpoint 证明压缩，不能直接往数据库插入 checkpoint 或用单测回调代替。
- C4 的文件篡改和回放只操作本轮新任务文件；先保存可恢复的原始字节。合法签名快照取自同一新任务较早状态，随后通过真实取消或交付形成最新服务端事实。任何写权限、运行时连接或查询能力不足应如实记录该场景阻塞，不扩大到既有用户文件、不清空 Redis。
- 每轮最长等待 240 秒，通过真实停止/生成终态控制连续步骤；复位用新 app/chat，C2/C3 内部状态按步骤连续承接。完成后通过正常删除入口清理本轮资源和临时模型/上游，恢复本轮故障文件并保存清理证明。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础与边界；新 D0 | 发送带三段 marker 的完整需求并暂存为 A，保留草稿。连续两轮明确继续 A 并分别提出不同修订，读取索引、task.json、request.md、requests/；正常生成/修订一次预览时再读取所引用的 plan 文件。新请求/新 runtime 恢复后重读相同资料。 |
| C2 | 边界；独立 D0，连续 A→B→A | 新建 A 并暂存后停止；记录 A 的需求、taskId、草稿和分片摘要。以明确独立新需求创建 B 并暂存后停止，记录 B。再按实际 taskId 继续 A，检查草稿并 validate/commit 交付 A；对比 B 与 W0。 |
| C3 | 压缩恢复；独立 A/B，承接其未完成草稿 | 在下一轮追加足量确定性上下文触发真实压缩，保存压缩调用与落库 checkpoint。再启动新请求，从 snapshot 指向的实际路径按需读取 A 的完整需求/方案，然后显式继续 A 并交付。核对恢复前后系统提示词及工具 schema 的稳定性，不每轮重写 task facts 到 system。 |
| C4 | 异常与资格边界；每个变体独立新任务 | 分别验证：①编辑本轮 task.json 的 payload 而不重签，发送恢复请求；②正常取消 A 后回放其较早合法签名文件，再尝试继续 A；③正常交付 A 后回放其较早合法签名文件，再尝试继续 A。篡改变体恢复原始字节后再正常读取，回放变体只比较服务端事实，不替换 Mongo metadata。 |

## 预期结果

公共断言：恢复入口始终属于当前 app/成员/会话；Sandbox 文件用于恢复资料，不能授予新的执行资格。按本轮限定条件只读查询 `chats`、`chatitems`，保留 `metadata.workflowBuilderTask`、`metadata.workflowBuilderTasks`、原始请求/预览/回复、contextCheckpoint、工具回执和候选版本。对文件比对实际字节/解析结构，不能只看文件存在或名称；对候选通过真实 version/load 检查文档。Redis/日志只在已有实际关联字段可读取时补证，不以缺少可选日志判业务失败。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API、Mongo、真实 Sandbox 文件 | request.md 保留完整原始 Human value，三段 marker 完整，后续修订不覆盖原文；requests 保留两轮各自内容，task metadata 的 requestSummary 可以截短但不能替代完整需求。计划文件与对应预览一致，重新连接后资料仍可读。 | 三次请求、实际 taskId/目录、原始需求与修订/方案文件、连接前后字节摘要及数据库记录。 |
| C2 | API、Mongo、真实 Sandbox/CLI、候选读取 | A/B 有不同 taskId 和草稿作用域；继续 A 复用 A 的资料和分片，候选只包含 A 的业务变更，B 未被自动交付、取消或混入 A。B 的需求、有效分片和状态保持原值；当前画布未自动改变。 | A/B stage 与停止响应、切换前后任务/分片快照、A 的 validate/commit、候选文档及 B/W0 差集。 |
| C3 | 真实压缩调用、API、Mongo、文件读取 | 本轮生成并持久化 contextCheckpoint，其中含 workflow_builder_task_index、实际目录和压缩时 taskId；快照最多含 5 个任务，完整资料留文件而非全部塞入 checkpoint。新请求能通过该路径读取 A 并完成交付，B 不被串用；系统提示词/工具定义不随任务状态变化。 | 上游压缩与后续请求、AI 原始 checkpoint、索引/文件读取工具真实结果、恢复交付和系统/工具哈希。 |
| C4 | API、Mongo、真实文件前后快照 | ①签名错误明确失败，不能当成空仓库重写索引或授予执行资格；恢复原文件后可正常读取。②③即使签名有效，服务端已取消或已交付的任务仍被拒绝继续，不新增 stage 成功、候选或版本，不覆盖最新事实；不要求删除已经产生的聊天/用量记录。 | 各变体原始/篡改/回放文件摘要、真实错误及工具回执、Mongo 最新事实、候选/版本精确差集与恢复证明。 |
