---
case_version: 1
id: "FG-APP-WORKFLOW-065"
title: "直接工具、模型工具结果与运行控制信号"
business: "app/workflow/execution"
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [workflow-runtime, mcp, toolcall, tool-stop, feedback, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/child/runTool.ts
  - packages/service/core/workflow/dispatch/ai/toolcall/index.ts
  - packages/service/core/workflow/dispatch/ai/toolcall/stopTool.ts
  - packages/service/core/workflow/dispatch/ai/agentLoopCore/application/runtime/workflowToolRunner.ts
  - packages/service/core/workflow/dispatch/tools/customFeedback.ts
  - packages/service/core/workflow/dispatch/loopRun/runLoopRun.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/chat/chatItemSchema.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-067, FG-APP-WORKFLOW-071, FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-062]
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-065.mjs
    items: [C3, C4]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 直接工具、模型工具结果与运行控制信号

## 用例简介

同一个外部工具既可能作为画布节点直接运行，也可能由模型作为工具调用；失败是否需要中断工作流取决于调用上下文。停止工具和自定义反馈是独立控制信号，不能被误认为异常、正文或重复的节点结果。

## 前置准备

- 使用包含本 PR 的主站、Pro 和隔离测试团队。Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB；不创建本机数据库、容器或卷，不修改 Dev 业务数据。模型、密钥和外部工具只配置在隔离环境及本轮资源中，凭据不写入图和证据。
- 准备测试团队可授权访问的受控 MCP 工具：成功时返回包含 `OK-RUN` 的合法 MCP 结果，失败时分别产生协议级失败与可解析的 `isError` 工具结果；服务按本轮 RUN 保存请求及次数。按页面真实配置和安全策略注册，不能关闭 SSRF 或伪造系统工具权限。HTTP 工具的各自协议映射需单独对照，不把 MCP 的 `isError` 语义直接套用到 HTTP 响应。
- D0：创建画布直接工具 W，正常出口和 catch 错误出口分别连接可观察后继；D1：创建 ToolCall/Agent 工作流 G，由受控模型按工具真实名称调用同一工具，再根据工具结果完成回复。D2：在 G 的工具调用分支中，将停止节点接在个人工作流工具之后；模型在该次调用后预设一次额外调用用于观察是否被阻止。停止节点仅能用于所属 ToolCall 的工具流程，不能通过 JSON 把它放入没有 ToolCall 的独立子工作流。D3：在子应用与循环中各执行一次自定义反馈节点，并保留父流程普通回复。保存实际导出图及合法资源绑定。
- 通过真实页面或 `POST /api/v2/chat/completions` 运行；每个独立变体使用新的 `fgtest-<RUN>-<case>` chatId。单阶段最长 120 秒，以终态、外部请求和响应详情取证；数据库只读查询限定本轮 teamId/sourceType/appId/chatId/dataId。缺少外部 MCP/模型或无法观察模型请求时，对应场景标为阻塞，不用伪造 callback 代替。
- 结束后只清理本轮明确 ID 的应用、工具和会话；未列入 automation 的场景由执行方逐项执行并留证。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 画布直接工具；D0 各变体新会话 | 正常返回一次；随后分别注入协议失败和 `isError` 工具结果，并在每种失败下对照 catchError 开/关。记录真实请求、节点输出、普通/错误后继和根摘要。 |
| C2 | 模型调用工具；D1 | 受控模型发起一次工具调用，工具返回 `isError`；模型读取该工具结果后继续生成正常答复。与 C1 中画布直接执行的相同失败对照。 |
| C3 | 停止工具；D2 | 受控模型调用个人工作流工具，当前工具分支在该调用后执行停止节点；随后本应发起的额外调用设置独立外部计数，另运行不含停止节点的配置对照。 |
| C4 | 子流程反馈；D3 | 子应用和循环各生成带不同 RUN 标记的反馈，父流程继续正常回复；刷新会话，读取本轮 AI 消息与响应树。 |

## 预期结果

公共断言：节点输入、工具请求、响应、根摘要和持久化消息必须属于同一 RUN。工具结果错误与工作流原始异常不能一概等同；不要求已发生的请求、成本或消息回滚，也不以刷新后有正文代替控制信号验证。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 成功时只有普通后继运行，消费真实工具返回值；两类失败均保留具体错误，捕获时只走错误出口且根错误数为 0，未捕获时普通后继不运行、根错误可见。 | 工具调用清单、nodeResponse 的工具输入/结果和错误、后继节点集合、chat.errorCount。 |
| C2 | `isError` 原样作为工具结果供模型消费，受控模型能继续答复；该工具内部失败不被直接提升成整轮工作流失败，且不会串入其他工具。 | 受控模型收到的工具结果、工具详情、最终答复与根摘要。 |
| C3 | 停止信号出现在当前工具分支的响应/摘要后，当前模型工具循环不继续执行预设额外调用；非停止对照能执行该调用。停止不是未捕获错误，也不是主动停止整条聊天的 API。 | 模型请求顺序、工具结果、`toolStop` 对应详情、外部计数和根摘要。 |
| C4 | 子应用及循环反馈各按实际执行次数归属到本轮 AI 消息，刷新后仍存在，不因父/子 Scope 层级重复累计；父普通回复仍可见。 | 本轮 `chatitems.customFeedbacks`、每层节点详情及刷新后的显示。 |
