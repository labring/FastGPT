---
case_version: 1
id: "FG-APP-WORKFLOW-067"
title: "嵌套节点响应归属、隐藏策略与统计不重复"
business: "app/workflow/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-067.mjs
    items: [C1, C2, C3, C4, C5]
tags: [pr-7992, workflow-context, node-response, runtime-summary, debug, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/service/core/workflow/dispatch/context/nodeResponse.ts
  - packages/service/core/workflow/dispatch/utils/summary.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/plugin/run.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/chat/nodeResponseStorage.ts
  - packages/service/core/chat/chatItemResponseSchema.ts
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/constants.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug.tsx
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/global/openapi/core/workflow/api.ts
routes:
  - "POST /api/core/workflow/debug"
  - "POST /api/core/chat/chatTest"
  - "POST /api/v2/chat/completions"
related: [FG-APP-WORKFLOW-060, FG-CHAT-CONVERSATION-003, FG-APP-AGENTV2-001]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 嵌套节点响应归属、隐藏策略与统计不重复

## 用例简介

父子工作流共享请求级输出通道，但每层的运行摘要和响应父级必须独立，不能把同一子节点重复写入树和统计。隐藏工具内部详情的策略也必须只约束相应子树，不能泄漏内部节点或连带隐藏普通兄弟节点。

## 前置准备

- 本轮 JSON 拓扑基线：tool-concurrent、loop-checkpoint、child-leaf/child-parent、error-routing；统一绑定说明见 `.agents/test/app/workflow/execution/fixtures/README.md`。资源、权限、失败和并发变体须完成真实绑定并保存最终 JSON，不能将模板校验算作业务通过。

- 专用团队、真实 Mongo/Redis、可运行的普通工作流 W 和个人工作流工具。Mongo 和 Redis 使用 Mac Mini 的独立测试库及 Redis DB，不创建本机数据库或清理 Dev 业务数据；未列入 automation 的场景由执行方逐项取证。D0 图为外层 ToolCall → 两个子工具，其中一支包含两次循环；两个子工具可复用相同模板 nodeId，但节点名称加不同 RUN 标记，末尾均返回固定业务输出。
- 受控外部模型按预先登记的请求清单返回确定的 usage（逐请求记录 input/output tokens）；保留真实生产调度、sink/writer 和用量写入。画布 ToolCall 当前固定串行执行工具，不能要求其两个分支同时到达 gate；真实 provider 并发完成顺序由 WORKFLOW-060/C2 验证。没有稳定 usage 或未触发预定子图时阻塞统计场景。
- D1 另准备带 `associatedPluginId` 的受控系统工作流工具，内部有更深一层子工作流；INTERNAL-RUN 仅写入内部节点名称/调试字段，公开业务输出不含该标记。另有普通可见兄弟工具 VISIBLE-RUN；隐藏判据按实际 associatedPluginId，不臆造前端“隐藏”请求字段。
- 以浏览器实际会话请求为模板，发布运行开启真实响应详情；另从节点调试抽屉抓取真实 debug 请求。UI 展开完整响应树；身份比对使用响应 `id/parentId`，不得因逻辑 nodeId 相同就去重掉不同调用。
- 只读 `chat_item_responses`：`find({teamId:ObjectId(T),sourceType:"app",appId:ObjectId(W),chatId:CHAT,chatItemDataId:AI_DATA_ID},{data:1})`；与同 chatId 的 `chats.summary/errorCount`、实际用量记录对照。保存操作前 row ID 集合，不能把历史行当成本轮重复。Debug 的 AI dataId 若响应未公开，可用测试前后精确 chatId 下的行差集确认无详情落库。
- 每行恢复 D0/D1 并新建 RUN/chatId；交互变体承接本轮暂停状态。单次最长 120 秒，按节点/交互/完成终态结束；清理本轮会话和应用。SSE 断线/续传完整时序复用 CONVERSATION-003，不在此复制。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | 按画布 ToolCall 的实际串行策略运行两个子工具并发布至完成；展开父 ToolCall、子工具和循环虚拟任务各层，查询本轮平铺 rows。provider 并发完成顺序由 WORKFLOW-060/C2 单独验证。 |
| C2 | 边界；D0 | 循环第 1 次暂停在表单，记录该次虚拟任务 ID；恢复后完成剩余步骤及第 2 次循环，再刷新详情与统计。 |
| C3 | 边界；D1 | 同轮调用隐藏系统工具和可见个人工具；隐藏工具内部再调用子流程，比较实时详情和刷新后的树。 |
| C4 | 异常；D0 | 一支子工具在输出有效节点结果后失败，另一支成功；再以调用者捕获错误并继续的独立变体对照。 |
| C5 | 边界；D0 | 在节点调试抽屉执行相同子图，核对 debug 的 nodeResponses、新变量及树；再在新的发布会话正常执行一次。 |

## 预期结果

公共断言：平铺存储、展示树与摘要是不同视图。对比具体响应实例和实际模型调用，不把每层已聚合的 tokens/费用再相加；允许同一次恢复为同 id/parentId 保存增量行，由读取器合并，而不是断言数据库绝无重复物理行。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 每个可见实际子运行在正确父响应下出现一次；子流程不因经过父 Scope 再转发而重复累计，兄弟节点不串 parentId。普通工具的最终 tokens 等于预定实际调用清单，不随嵌套层数倍增。 | 原始节点事件、rows 的 id/parentId/增量清单、展开树、模型 usage 清单与最终 summary。 |
| C2 | 暂停和恢复使用同一迭代身份合并详情，已完成节点不重复执行；每次迭代只显示一层有效虚拟任务，续跑摘要保留暂停前已完成统计而不再加一次。 | 两轮请求、gate/模型次数、迭代 ID、合并后树与最终统计差集。 |
| C3 | INTERNAL-RUN 及后代内部详情不进入调用者实时输出或持久化详情；更深子流程不能重新放宽父策略。VISIBLE-RUN 正常显示并保存。隐藏不能抹掉系统工具的业务结果、失败信号或合法计费；系统工具专用 token/费用规则单独按工具配置核对，不套用 C1 的普通叶子求和。 | 两种标记的 SSE/rows/树精确集合，业务输出与工具计费配置。 |
| C4 | 子错误和成功分支归属明确；节点内捕获时继续执行，工具内未捕获时错误作为工具结果交给模型，若模型随后正常完成则根 `errorCount=0`。父包装器不能把同一错误/用量按嵌套层重复贡献；根工作流未捕获错误的传播由 WORKFLOW-062 单独验证。 | 错误处理配置、各层响应、模型实际收到的工具结果、最终 errorCount 与真实用量。 |
| C5 | Debug 使用请求内详情并返回 `code=200` 下有效 `data.nodeResponses/newVariables`，不写该调试的 chat_item_responses；后续发布运行仍按自己的 sink 正常落库/输出，不被前一调试策略污染。 | Debug 响应、前后 rows 差集及新发布会话详情；不能只看 HTTP 200。 |
