---
case_version: 1
id: "FG-APP-WORKFLOW-056"
title: "运行内核的协议、调度控制与请求隔离"
business: "app/workflow/execution"
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-056.mjs
    items: [C1, C2, C3, C4, C5, C6]
tags: [pr-7992, workflow-context, runtime-control, workflow-queue, headless, debug, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database, cache]
sources:
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/workflow/dispatch/context/index.ts
  - packages/service/core/workflow/dispatch/context/variables.ts
  - packages/service/core/workflow/dispatch/context/nodeResponse.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/workflow/dispatch/parallelRun/runParallelRun.ts
  - projects/app/src/pages/api/core/workflow/debug.ts
  - projects/app/src/pages/api/v1/chat/completions.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
related: [FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-055, FG-CHAT-CONVERSATION-004]
routes: ["POST /api/v1/chat/completions", "POST /api/v2/chat/completions", "POST /api/core/workflow/debug"]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 运行内核的协议、调度控制与请求隔离

## 用例简介

同一工作流在普通聊天、流式聊天、节点调试和无 HTTP 服务入口中，应使用完整且互不污染的运行上下文。队列迁移到独立模块不能改变节点路由、暂停边界、运行预算或深度约束；本例不把尚未实现的 MQ 分布式执行当作本轮能力。

## 前置准备

- 部署上述 PR 工作树，记录 commit、未提交改动摘要和实际启动路径；Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB，对象存储使用本轮专用前缀；不创建本机数据库、容器或卷，不修改 Dev 业务数据。准备隔离测试团队及登录态，确认主站、Pro 与服务入口均指向本轮依赖，并逐项保留执行证据。
- 使用同目录 `fixtures/*.json`；生成与静态校验入口为 `workflow-fixtures.mjs`。所有 `__CHILD_APP_ID__`、`__GATE_URL__`、`__MODEL_ID__`、`__FILE_URL__` 必须绑定真实本轮资源后保存一份最终 JSON。静态校验不算业务通过。
- 公共 D0 使用 `input-precedence.json`，变量默认 `a=A0,b=B0,stamp=S0,n=9,flag=true,text=seed`。故障使用真实 HTTP 节点访问 `workflow-fixture-server.mjs` 的外部受控 503；目录服务只提供明确声明的空模型目录，不替换内部权限、Context 或队列。
- 每个独立变体新建 `fgtest-<RUN>-<场景>-<变体>` chatId；暂停恢复必须沿用原 chatId，连续 Debug 必须携带真实 memoryNodes/memoryEdges/entryNodeIds/skipNodeQueue，不伪造完成状态。
- 读 Mongo 时固定 teamId/sourceType/appId/chatId；核对 chats.variables、chatitems、chat_item_responses。预算和深度不是公开 API 参数，C6 通过真实服务入口构建 Context 验证，不向 HTTP body 增加假字段。
- 读取 SSE/响应与完成后持久化结果，单阶段最长 120 秒；屏障到达最长 30 秒，超时保留实际事件，不能仅睡眠后判成功。清理只删除本轮创建的应用、会话与专用依赖。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/兼容；每变体恢复 D0 | 对 v1/v2 × stream=false/true 四种组合执行同一发布图；分别传默认值和合法 `n=0,flag=false,text=""` 输入。额外对空文本入口执行 `empty-input.json`。 |
| C2 | 异常；`error-routing.json`，每变体新会话 | HTTP 返回受控 503，分别开启/关闭 catchError；再把端点换成正常 `/count` 对照。记录 Normal/Caught 的实际执行集合、节点错误和最终摘要。 |
| C3 | 边界；循环与并行模板独立复位 | 两容器分别使用空数组、`[0,false,""]`；循环增加首次即 break 变体，并行设零重试。读取任务结果、迭代实例和消费者输出。重试的差量提交完整规则由 WORKFLOW-060/C5 验证。 |
| C4 | 边界；合法运行时图转换后调用 Debug | 逐阶段执行 `root-variables.json`，第一阶段后携带返回的 memory 与下一入口继续直到无 entry；另运行有子容器的阶段。验证不提前执行后继节点，子流程本身不被错误切成父级 Debug 单步。 |
| C5 | 并发边界；两个独立 chatId | 同一发布图并发传入不同 RUN 与变量标记，一个在 gate 等待、另一个先完成；恢复前者后比较各自变量、响应归属、输出和会话记录。随后让一轮失败，再用新会话执行正常图。 |
| C6 | 服务边界；真实完整 Context，非 HTTP 参数 | 预算分别为 0 和仅足够一阶段；在允许最大深度及其外侧运行；慢节点等待期间由兄弟节点扣预算，再在慢节点内启动子流程。使用真实生产节点和门控服务，禁止 mock callbackMap/Queue。 |

## 预期结果

公共断言：完整上下文在入口构建，节点不接收 res、变量实例或响应 sink 的序列化副本；对比真实响应、节点执行集合和持久化副作用。变量 setter/快照细节复用 WORKFLOW-060，不再重复加密与文件鉴权矩阵。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 四种协议均完成且业务结果一致，0/false/空串不回退默认值，无文件也不报 Context 缺失。空文本变体固定回复 EMPTY-OK；SSE 中结束事件完整，非流式为有效 choices，不以 HTTP 200 代替成功。 | 四种请求、逐事件 SSE/JSON、各自最终 variables 与消息记录。 |
| C2 | 捕获时只执行 Caught；正常时只执行 Normal；未捕获时两个后继均不执行且最终保留失败。不得把普通业务 `error` 字段误判原始异常，原始 stack/cause 不成为非声明输出。 | 正常/错误/未捕获三组执行节点集合、响应与数据库摘要。 |
| C3 | 空容器不执行 body；0/false/空串按原值传给真实子节点，不丢项；break 后不执行后续迭代。并行输出按任务身份关联，不能以完成时序改变任务索引。 | 输入与任务结果精确对照、body 次数、id/parentId 集合。 |
| C4 | 一次只推进父级当前阶段，返回的 entry 可继续且不重放已完成节点；子图完整执行自己的阶段。Debug 不写聊天详情，后续发布聊天的 sink 不受其影响。 | 每阶段 memory、entry、nodeResponses/newVariables、同 chatId 详情行差集。 |
| C5 | 两个请求的 RUN、variables、响应树及控制状态互不串用；一个结束/失败不关闭另一个输出通道，新会话不继承旧错误/停止标记。 | 门控到达/完成顺序、原始 SSE、两个 chatId 精确数据库结果。 |
| C6 | 零预算不运行节点且不被默认值覆盖；预算按当前层扣减，子运行继承节点启动时的控制快照而非稍后变化的父对象。子层扣减/深度变化不回写父层；超过深度上限不执行更深节点，退出后恢复父状态。 | 服务实际入参及上下文前后状态、gate 记录、真实发布事件与返回摘要；不能以单测结果代替。 |
