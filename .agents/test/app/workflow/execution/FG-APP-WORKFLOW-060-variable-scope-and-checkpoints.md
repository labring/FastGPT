---
case_version: 1
id: "FG-APP-WORKFLOW-060"
title: "子运行变量隔离、差量提交与交互检查点"
business: "app/workflow/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation: []
tags: [pr-7992, workflow-context, variable-context, snapshot, toolcall, loop, parallel, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database]
sources:
  - packages/service/core/workflow/dispatch/context/index.ts
  - packages/service/core/workflow/dispatch/context/variables.ts
  - packages/service/core/workflow/dispatch/utils/containerRunState.ts
  - packages/service/core/workflow/dispatch/tools/runUpdateVar.ts
  - packages/service/core/workflow/dispatch/ai/toolcall/toolProvider/createToolCallToolProvider.ts
  - packages/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - projects/app/src/pageComponents/app/detail/useChatTest.tsx
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/global/openapi/core/workflow/api.ts
  - packages/service/core/chat/chatSchema.ts
  - packages/service/core/chat/saveChat.ts
routes:
  - "POST /api/core/workflow/debug"
  - "POST /api/core/chat/chatTest"
  - "POST /api/v2/chat/completions"
related: [FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-055, FG-APP-AGENTV2-001]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 子运行变量隔离、差量提交与交互检查点

## 用例简介

同一工作流中的工具、循环和并行任务可以各自修改变量，但失败或停止的副本不能污染父运行，正常完成或交互暂停时也不能用旧副本覆盖其他任务的新值。本例验证不同执行器各自的提交边界，以及文件、密码等特殊变量写回后仍保留正确的存储形态。

## 前置准备

- 本轮 JSON 拓扑基线：root-variables、special-variables、tool-concurrent、loop-checkpoint、parallel-retry、child-leaf/child-parent；统一绑定说明见 `.agents/test/app/workflow/execution/fixtures/README.md`。资源、权限、失败和并发变体须完成真实绑定并保存最终 JSON，不能将模板校验算作业务通过。

- 部署上述主仓库基线；使用专用团队 T、可编辑并运行应用的用户 U、真实 Mongo/Redis 和代码沙箱。数据库统一使用 Mac Mini 的独立测试库及 Redis DB，不新建本机数据库或容器；主站、Pro 和服务入口须指向同一测试隔离环境。准备普通工作流 W、子应用 A，以及由界面配置导出的 ToolCall、循环、并行三个变体；不导入测试专用 `internal/runtimeNode`，不替换生产 Queue、Context 或变量 setter。
- 当前无已核验可在该隔离环境完整执行的自动化映射；由执行方按各子场景独立取证，旧脚本不得以共享 dev 数据库或本机数据库代替。
- 公共基线 D0：定义 `a="A0"`、`b="B0"`、`stamp="S0"`、数值 `n=9`、布尔 `flag=true`、字符串 `text="seed"`、对象 `obj={items:[1]}`、文件变量 `files`、密码变量 `password`。所有输入都使用变量配置支持的实际类型；准备无敏感价值的测试密码。
- 工具内部用真实 HTTP 节点访问测试 gate。C3 的聊天链路采用外部受控模型，依据请求中的真实工具名称产生确定调用。C2 则使用真实 `createToolCallToolProvider` 的服务集成入口并发调用 `executeTool`，构建完整 Context、真实 Queue 和数据库 writer；初态等价于父 Queue 已完成 Start 并进入 ToolCall callback，所有根 isEntry 已复位。当前聊天外壳明确 `batchToolSize=1`，不能将 C2 的服务并发结果宣传为聊天入口支持并发，也不能为测例改成并发配置。
- 快工具 F 只写 `b="B1", stamp="fast"`，慢工具 S 只写 `a="A1", stamp="slow"`；两者先到 gate 再修改。末尾消费者输出上述变量和指定节点输出的 JSON。失败变体在写变量、产出一个带 RUN 标记的节点输出后，再由受控 HTTP 节点触发可复现错误。
- 每行使用新的 RUN/chatId 并恢复 D0；C4 暂停与恢复、C5 两次尝试是连续过程。HTTP 请求从真实测试聊天或已发布应用抓取；调试回放沿用实际 `nodes/edges/chatConfig`，不把 `variableContext`、sink 或函数放入请求。
- 调试查统一响应 `code=200` 且检查 `data.newVariables`、`data.nodeResponses`；发布聊天同时读本轮 `chats.variables`。数据库只读条件为 `{teamId:ObjectId(T),sourceType:"app",appId:ObjectId(W),chatId:CHAT}`。密码证据仅保留结构和比较结果，不保存明文或完整密文。
- 单次 gate 到达最长 30 秒，放行后最长 120 秒观察工作流完成或交互暂停；超时保留请求与 gate 证据。完成后通过应用管理界面清理本例应用、会话、上传文件及 gate 数据，不删除其他会话。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界；D0 | 变量更新节点依次写 `n=0`、`flag=false`、`text=""`、`obj={items:[1,2]}`，紧接条件判断和输出节点读取。文件变量写回已知私有文件运行 URL，密码改为测试新值；先调试，再用独立会话发布运行并刷新。 |
| C2 | 边界；服务入口、两个工具均已进入 gate | 使用真实 provider 先启动 S 再启动 F，但先放行 F，等待其 Promise 返回并读取父 b=B1，再放行 S；复位后交换发起顺序，仍保持 F 先完成。比较最终父 Context 变量、两个工具输出和实际数据库响应，不伪造 MQ 或聊天并发。 |
| C3 | 异常/恢复；D0 | 单工具写变量并完成一个输出节点后触发错误，调用者继续到消费者；以相同前序节点后正常暂停表单作独立对照。暂停后沿用 chatId 提交表单，核对恢复后的变量与前序 gate 次数。 |
| C4 | 边界；D0，循环只含一项 | 循环内先写 `a="checkpoint"` 并请求一次 RUN gate，再暂停于表单节点；记录暂停结果，提交表单恢复，执行后续消费者。不得把恢复当成新会话。 |
| C5 | 异常/恢复；D0 | 并行容器两个任务：任务 0 第一次写入 `a="failed"` 后失败、重试成功写 `a="retry-ok"`；任务 1 独立写 `b="B1"`。启用一次重试，验证每次尝试的 gate 记录和最终结果；另以不重试的失败副本作对照。 |
| C6 | 边界；D0 | 通过子应用节点调用 A，显式传入同名变量 `a="child-input"`；A 将其改为 `child-output` 并作为业务输出返回，父消费者同时读取父 `a` 和 A 输出。 |

## 预期结果

公共断言：只按已确认的执行完成时序判断覆盖关系；未修改字段不得因副本较旧而写回。状态快照不是数据库事务，不回滚已经发生的 HTTP、响应发布或实际费用，也不承诺多字段提交异常时原子回滚。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 后续节点精确读到 `0/false/""/{items:[1,2]}`，不回退默认值。已知私有文件持久化仍含原 key/name/type，不把预览签名当永久外链；密码存储为 secret 加密结构，运行消费者可验证新密码。 | 消费者 JSON、调试 `newVariables`、限定会话的 variables 快照；不以 SSE 中间变量事件代替最终父状态。 |
| C2 | 两个变体最终均为 `a=A1,b=B1,stamp=slow`；F 的旧副本不能把 a 改回 A0，S 的旧副本不能把 b 改回 B0。provider 的完成提交不按调用发起顺序排队，不能要求整份对象最后写入覆盖；不覆盖聊天外壳自身串行策略。 | 真实 provider 调用清单、gate/Promise 完成顺序、两个子输出、writer rows 与父变量的精确差集。 |
| C3 | 失败工具的全局变量仍为父基线；正常交互暂停保存已完成增量 `a=A1,stamp=slow`，同会话恢复仍可读到这些值且不重跑前序 gate。工具 runner 已完成的节点输出按独立 finally 策略保留；错误、交互结果与真实用量不会回滚。 | 父变量前后快照、已完成节点 output、暂停/恢复数据和 gate 次数；拒绝把错误前的外部请求计数重置为 0。 |
| C4 | 循环交互暂停是 checkpoint：暂停前修改可保留；恢复后仍为 checkpoint，已完成 gate 不重放，后续消费者只执行应续跑部分。 | 暂停/恢复响应、gate 精确次数、会话 variables 与节点运行记录。 |
| C5 | 只有成功尝试写入父状态，最终 `a=retry-ok,b=B1`；重试成功时已恢复的失败 attempt 保留详情并标记 `errorCaptured=true`，本轮 `errorCount=0`。无重试的失败任务不写 failed，若另一个任务成功则并行状态为部分成功，未恢复的失败仍可见且计入错误；用量允许累计真实失败尝试。 | 并行任务/attempt 明细、消费者 JSON、gate 清单、chat.errorCount 及最终变量差集。 |
| C6 | A 消费 child-input、返回 child-output；父 a 保持 A0，只有明确映射的业务输出变化。子应用的变量实例不能因共享 Context 能力而与父实例合并。 | A 输入/输出、父消费者输出与最终会话快照。 |
