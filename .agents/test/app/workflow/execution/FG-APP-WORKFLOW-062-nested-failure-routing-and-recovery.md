---
case_version: 1
id: "FG-APP-WORKFLOW-062"
title: "多层工作流错误路由、容器恢复与失败摘要"
business: "app/workflow/execution"
types: [api, ui, integration]
category: abnormal
scenario: failure
priority: P0
status: ready
tags: [workflow-runtime, nested-workflow, error-routing, catch-error, loop, parallel, retry, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/core/workflow/dispatch/plugin/run.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts
  - packages/service/core/workflow/dispatch/parallelRun/service.ts
  - packages/service/core/workflow/dispatch/context/nodeResponse.ts
  - packages/service/core/workflow/dispatch/utils/summary.ts
  - packages/global/core/chat/utils.ts
  - packages/service/core/chat/chatSchema.ts
  - projects/app/src/service/core/workflow/nodeResponse.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-055, FG-APP-WORKFLOW-056, FG-APP-WORKFLOW-058, FG-APP-WORKFLOW-060, FG-CHAT-CONVERSATION-004]
automation: []
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 多层工作流错误路由、容器恢复与失败摘要

## 用例简介

用户将子应用、工作流工具、条件分支及循环或并行容器组合为多层工作流时，内部失败必须在正确的边界被捕获或向外传播。运行详情应保留真实失败，而最终响应、错误路由和摘要只能反映未恢复的错误，不能因层级或重试重复计数。

## 前置准备

- 运行本 PR 的主站与 Pro；Mongo/PG/Redis 使用 Mac Mini（100.96.142.32）的独立测试库、schema 或 Redis DB，对象存储使用本轮专用前缀。不在本机创建数据库、容器或卷，不修改 Dev 业务数据；账号及连接凭据仅从仓库外配置读取。准备可创建、发布和运行应用与个人工作流工具的测试成员。
- 以同目录 `fixtures/child-parent.json`、`child-leaf.json`、`basic-tool-child.json`、`error-routing.json`、`loop-container.json`、`parallel-retry.json` 和 `interactive-checkpoint.json` 为拓扑基线，在编辑器按场景添加节点并正常校验、保存和发布；占位符替换为本轮资源和 gate 地址，保存实际图与版本 ID。模板不是完整变体，静态通过不算运行通过。
- D0：创建根工作流 W → 子应用 A → 个人工作流工具 K；K 的输入与输出使用真实工具输入/输出节点，在其间插入 HTTP 节点 F。F 的 `/fail` 返回受控 503，`/count` 返回成功；F 后分别连接正常出口与 `source_catch-right` 错误出口，并让 K、A、W 的对应消费者输出唯一标记。每层单独配置 `catchError`，不可让父图直接连到子图内部节点。
- 另用 `loop-container` 构造包含三项输入 `[0,"fail",2]` 的循环 L：第 1 次运行成功，第 2 次通过 F 失败，第 3 次可由本轮 gate 计数。并用 `parallel-retry` 创建独立并行图 P：任务 0 首次失败、重试成功，任务 1 正常成功；同时准备零重试的独立变体。各图均在错误出口和正常出口分别接入带标记的可观察消费者。
- 通过真实页面或 `POST /api/v2/chat/completions` 发起运行，`stream=true`、`detail=true`；每个独立变体使用新的 `fgtest-<RUN>-<case>` chatId，只有 C7 续跑承接原 chatId。`workflow-fixture-server.mjs` 只模拟外部 HTTP，地址须符合现有出站安全策略，不能关闭 SSRF。gate 到达每秒轮询、最长 30 秒，工作流每阶段最长 120 秒；超时记录阻塞或失败，不把超时当完成。
- 记录实际 SSE 事件、最终消息、节点详情和 gate 外部副作用；必要时只读 `chats`、`chatitems`、`chat_item_responses`，按本轮 `teamId/sourceType/appId/chatId` 和响应 ID 精确限定。响应树按 `id/parentId` 合并增量行，不按 nodeId 或物理行数猜测执行次数。结束后仅通过正常入口清理本轮资源并核验对应 ID，不清理共享数据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 子层恢复；D0 新会话 | F 返回 503，K 内开启 F 的 catchError，错误出口连接 K 的正常输出；A 与 W 的调用节点正常出口继续。记录 K 的错误与恢复输出、A/W 的后继执行集合。 |
| C2 | 父层恢复；恢复 D0 | F 与 K 调用节点不捕获，在 W 的子应用 A 节点开启 catchError；将 A 的错误文本输出连接到 W 的错误消费者，并保留一条普通后继作为对照。 |
| C3 | 未捕获；恢复 D0 | F、K 调用与 W 的子应用节点均不捕获同一 503；记录每层响应、根工作流终态与正常/错误后继是否执行。 |
| C4 | 嵌套条件；恢复 D0 | 在 W 中用条件节点分别选择 A 路径和无关成功路径；A 路径采用 C2 的父层捕获。两组均通过外部 gate 记录 A、未选分支及各后继的实际调用集合。 |
| C5 | 循环异常；独立 L 图 | 第 2 次迭代返回 503，分别开启和关闭 L 节点 catchError；比较两次运行的迭代历史、父级错误出口、正常后继、最终错误数与详情。 |
| C6 | 并行恢复；独立 P 图 | 按 WORKFLOW-060/C5 的两任务图运行一次重试成功；恢复零重试变体再运行一次。对照每个 attempt 的错误详情、父级并行状态与工作流摘要。 |
| C7 | 暂停后失败；D0 的独立变体 | 在 K 的 F 前插入计数 gate 和表单，首次运行到真实交互暂停；刷新页面后以原 chatId 提交表单，随后让 F 失败并在 W 的 A 节点捕获。再用新 chatId 执行成功对照。 |

## 预期结果

公共断言：只在实际完成/失败/暂停后判断；保留失败前已发生的外部请求、使用量和节点详情，不声称快照提交会回滚外部副作用。敏感信息、cookie 和完整签名 URL 不进入证据。模型生成、资源权限和 SSE 生命周期分别复用关联用例，不用其他测试的通过结果代替本例。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | K 的 F 保留错误详情且标记已捕获，K 走恢复出口；A/W 走正常出口且不产生新的根错误，本轮 `errorCount=0`。 | F/K/A/W 的节点详情、消费者标记、最终摘要和 gate 精确次数。 |
| C2 | 错误沿 K→A 冒泡，W 的 A 节点标记已捕获并仅激活错误出口；错误消费者收到当前失败文本，普通后继不执行，根 `errorCount=0`。 | 三层响应及 parentId、错误输出、两条后继的实际运行与本轮 chat.errorCount。 |
| C3 | W 的两个后继均不执行，失败文本在根响应可定位，本轮根错误计数为 1；不因失败发生在 K 而把同一错误按三层重复累计，也不向未声明输出泄露内部 stack。 | 各层错误、根摘要、响应错误提取及本轮 gate 记录。 |
| C4 | 只执行选中分支；选 A 时遵循 C2，选成功分支时 F 和 A 的外部调用均为 0。汇合节点不因另一条 skipped 边提前运行或重复运行。 | 条件结果、精确的节点/外部调用集合及汇合次数。 |
| C5 | 两种变体均只有前两次迭代，失败迭代记录错误且第三次 gate 不执行；迭代 wrapper 保留错误但标记 `errorCaptured=true`。循环捕获时仅错误出口运行且根 `errorCount=0`；未捕获时无后继运行、根 `errorCount=1`，不能是 2。 | `loopRunHistory`、迭代 wrapper 与父循环响应、后继集合和 chat.errorCount。 |
| C6 | 重试成功时两个最终任务均成功，失败 attempt 保留详情并标记已恢复，根 `errorCount=0`；零重试时失败任务不覆盖成功兄弟，最终状态为部分成功，未恢复的错误仍可见。变量差量和实际费用按 WORKFLOW-060/C5 核验。 | attempt ID/详情、并行状态、根摘要、消费者输出及 gate 次数。 |
| C7 | 续跑使用表单本轮输入，暂停前 gate 只执行一次；恢复后的错误按 C2 被父级捕获，不重放已完成节点。新的成功会话不继承前一会话的错误或停止状态。 | 两轮交互请求、gate 次数、父子响应身份、错误出口与新会话摘要。 |
