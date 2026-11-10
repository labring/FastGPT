---
case_version: 1
id: "FG-APP-AGENTV2-001"
title: "AgentV2 子应用上下文隔离与交互续跑"
business: "app/agentv2/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [pr-7992, workflow-context, agentv2, child-workflow, memory-scope, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/service/core/workflow/dispatch/ai/agent/index.ts
  - packages/service/core/workflow/dispatch/ai/agent/sub/app/index.ts
  - packages/service/core/workflow/dispatch/ai/agent/adapter/userContext.ts
  - packages/service/core/workflow/dispatch/context/index.ts
  - packages/service/core/workflow/dispatch/context/variables.ts
  - packages/service/core/workflow/dispatch/context/memory.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/service/core/chat/chatItemResponseSchema.ts
  - packages/service/core/chat/constants.ts
routes:
  - "POST /api/v2/chat/completions"
related: [FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-055, FG-PERMISSION-RESOURCE-003, FG-CHAT-CONVERSATION-004]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# AgentV2 子应用上下文隔离与交互续跑

## 用例简介

AgentV2 调用子应用时，子应用需要独立的变量、资源和响应摘要，同时保留属于自己调用路径的记忆与暂停位置。用户继续回答表单后应恢复原子流程，不能重新使用最初工具参数，也不能把另一个克隆应用的记忆或子流程正文混入最终回答。

## 前置准备

- 本轮 JSON 拓扑基线：agent-child、child-leaf、interactive-checkpoint；统一绑定说明见 `.agents/test/app/workflow/execution/fixtures/README.md`。资源、权限、失败和并发变体须完成真实绑定并保存最终 JSON，不能将模板校验算作业务通过。

- 专用 AgentV2 应用 G；两个从相同模板克隆、内部 nodeId 相同但 App ID 不同的 A/B，均调用同一个后代工作流工具 K。Mongo/Redis 使用 Mac Mini 的独立测试库及 Redis DB，不创建本机数据库或清理 Dev 业务数据。K 的有历史 AI 节点使用受控模型，返回输入上下文摘要，并记录收到的历史；A/B 分别使用唯一标记 A-RUN/B-RUN。保留真实模型 HTTP、生产子应用加载与记忆读写。
- 受控 Agent 模型按真实 tools 名称确定调用 A、B 及第二轮仅 A，最终自己返回固定 `PARENT-RUN`。模型/工具请求清单是验收依据，不以随机生成自然语言判断是否隔离。配置合法资源、变量映射和调用权限；文件额度/鉴权细节复用关联用例，不在这里重复拒绝矩阵。
- D0：G 有同名父变量 `local="parent"`；A/B 的对应子变量分别初始化为 a/b，再在子流程内修改。子应用返回的业务文本带 CHILD-A/CHILD-B 标记，Agent 最终固定回答不带这两个标记。模型摘要用于验证记忆，不向外发送真实敏感内容。
- D1：A 在一次可计数 gate 后暂停表单，表单输入将在后续节点原样输出。保存本轮聊天交互消息，不手工复制 nodeOutputs/memoryEdges 伪装恢复；通过实际 UI 回复表单。
- 用真实 UI 生成请求并记录 G 的 appId/chatId、AI dataId；只读 `chatitems` 的本轮 memories/value 与 `chat_item_responses.data`，条件限定 teamId、sourceType=app、appId=G、chatId。记忆键按实际记录和 `WorkflowMemoryContext` 规则解析，不固定猜测一个旧版 nodeId 键。
- 每个独立场景新 chatId 并恢复 D0/D1；C1 两轮、C2 暂停恢复承接同一会话。每阶段最长 120 秒，清理应用、会话、gate 和模型记录。无法提供确定调用次序/历史观测时阻塞对应场景。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界；D0 | 第一轮调用 A、B，再在同会话第二轮仅调用 A；记录各次 K 的历史、A/B 子变量、父最终变量和最终正文。 |
| C2 | 边界；D1 | A 暂停后刷新聊天页面，提交与最初工具入参不同的表单值 `RESUME-RUN`；恢复到子应用完成、Agent 最终回复。 |
| C3 | 边界；D0 的独立配置副本 | 将 G 的 Agent 节点分别设为普通历史、禁用历史 `history=0` 执行下一轮；另在 `history=0` 的交互暂停场景恢复，检查当前 checkpoint 与普通历史禁用的区别。 |
| C4 | 异常；D0 | A 的后代工具产生可复现失败，B 正常成功；观察错误传回 Agent、B 的历史与响应归属，随后在新会话重新正常调用。 |

## 预期结果

公共断言：应用身份属于调用路径；复用同一模板/后代插件不意味着共享记忆或变量实例。子应用业务结果可以进入工具结果供 Agent 使用，但子流程 transcript 不应直接再次拼接到父最终回答。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | A/B→K 的历史彼此隔离，第二轮 A 只续接自身路径；子变量变化不直接覆盖 G.local。最终正文只有受控 Agent 的 PARENT-RUN，CHILD 标记只在各自工具结果/详情中，不重复拼成正文。子记忆 delta 能合并保存，刷新后的下一轮不会全部丢失。 | 真实模型历史请求、父/子输入输出、chatitems.memories 和最终正文/详情。 |
| C2 | 恢复使用当前表单 RESUME-RUN，而不是最初 userChatInput；gate 不重放，暂停前节点输出与记忆边沿用，表单不会无故再次出现；响应仍挂原子调用路径。 | 两轮用户值、gate 次数、子输出、交互记录与树的父级身份。 |
| C3 | 普通新调用禁用历史时不继承旧轮次记忆；同一交互的恢复仍保留当前 checkpoint，不能因为 history=0 把恢复当作从头开始。 | 各模型实际收到的历史、gate 次数和恢复结果；不通过清空数据库代替 history 配置。 |
| C4 | A 的错误返回其工具结果/摘要，不串到 B 的独立 Context；B 的合法响应、记忆和用量仍可保存。新会话不继承旧错误/停止状态，不要求已发生的请求和费用回滚。 | A/B 详情、模型请求、最终统计与新会话正向结果。 |
