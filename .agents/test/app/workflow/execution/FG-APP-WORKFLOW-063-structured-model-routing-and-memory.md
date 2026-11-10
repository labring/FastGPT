---
case_version: 1
id: "FG-APP-WORKFLOW-063"
title: "分类和内容提取节点的分支、结构化输出与记忆"
business: "app/workflow/execution"
types: [api, integration]
category: boundary
scenario: special
priority: P1
status: ready
tags: [workflow-runtime, classify, extract, model, memory-context, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/ai/classifyQuestion.ts
  - packages/service/core/workflow/dispatch/ai/extract.ts
  - packages/service/core/workflow/dispatch/context/memory.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/workflow/resource/service.ts
  - packages/service/core/chat/chatItemSchema.ts
  - packages/global/core/workflow/constants.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-058, FG-APP-WORKFLOW-059, FG-APP-WORKFLOW-062, FG-PERMISSION-RESOURCE-003]
automation: []
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 分类和内容提取节点的分支、结构化输出与记忆

## 用例简介

分类和内容提取虽然都调用模型，但它们还会决定后续分支、结构化字段及节点记忆。通过真实运行入口和可观测的外部模型响应，检查这些结果能被下游消费，且模型异常或不同会话不会造成串线。

## 前置准备

- 在包含本 PR 的主站及 Pro 上运行；Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB，不创建本机数据库、容器或卷，不修改 Dev 业务数据。准备隔离团队、可发布工作流成员、可用模型及本轮独立应用。凭据仅来自仓库外环境配置。
- 基于 `fixtures/basic-model-chain.json`，在编辑器分别构建并发布两张图：分类图 W1 的类别为 `a=订单`、`b=售后`、`other=其他`，三个出口各连接不同的计数节点及汇合回复；提取图 W2 声明必填字符串 `status`（默认 `closed`），连接下游回显 `status`、`success` 和完整提取结果。保留实际节点 ID、分类端口 ID 和发布图。
- 优先使用测试团队已授权的 DeepSeek-V4.1 flash 完成真实模型可用性对照；严格验证未知类别、额外字段和非法 JSON 时，使用仅在隔离环境配置、可记录请求的受控外部模型服务，逐次返回下表指定内容。仍保留真实模型资源鉴权、LLM 客户端、Queue、Context 和用量链路，不 mock 节点 callback；无法配置受控模型时对应变体标记阻塞，不能以真实模型偶然输出代替确定性证据。
- 用真实 `POST /api/v2/chat/completions`、独立 `fgtest-<RUN>-<case>` chatId 运行；C4 的两轮沿用同一 chatId，其余变体使用新会话。每阶段最长 120 秒；记录实际模型 ID/请求、所选节点/端口、最终消息、运行用量和响应详情。数据库只读查询限定本轮 teamId/sourceType/appId/chatId，所有证据去除凭据与敏感内容。
- 完成后按本轮明确的资源 ID 清理隔离测试资源；不得对共享 dev 安装或删除模型。当前无已验证的自动化映射，由执行方逐项留证。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 分类正常；W1 新会话 | 受控模型依次返回 `a` 和 `售后`，各开新会话；记录模型请求、分类结果、三个出口各自调用次数和汇合回复。 |
| C2 | 分类边界；W1 新会话 | 受控模型返回不含类别 key/value 的 `unknown result`，另以空问题调用作独立拒绝对照。 |
| C3 | 提取正常与默认；W2 每变体新会话 | 受控模型分别返回 `{"status":"open","extra":"ignored"}`、`{}` 和不含 JSON 的文本；读取动态字段、完整 JSON 输出、success 和下游回显。 |
| C4 | 记忆边界；W1/W2 分别两轮 | 第一轮完成分类或提取后，同会话第二轮分别设置允许历史和 `history=0`；再以相同节点 ID 的独立子应用运行一次，观察模型实际收到的历史/记忆和各自的结果。 |
| C5 | 模型错误；W1/W2 独立新会话 | 让受控模型返回可复现的请求失败，分别开启和关闭当前模型节点 catchError；记录正常和错误出口、节点错误及根摘要。 |

## 预期结果

公共断言：使用节点事件和实际下游输入确认结果，不能仅根据模型原始文本或 HTTP 200 判定成功。自由模型可能产生不同措辞，只核对其真实选择的合法类别及一致的下游传递；确定性的错误/兜底断言以受控模型变体为准。详情、用量和历史只按当前运行身份归属。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 返回 key `a` 时只走订单出口，返回 value `售后` 时只走 b 出口；分类输出是类别 value，不是未处理的模型原文，其他出口均无业务调用。 | 模型响应、分类 `cqResult`、三个 gate 次数与汇合回复。 |
| C2 | 未识别响应走最后配置的 `other` 出口且只执行一次；空问题不会请求模型或伪装成分类成功，错误按节点 catch 配置处理。 | 受控响应、类别配置、出口调用清单、模型请求次数和错误详情。 |
| C3 | 第一组输出 `status=open` 且不暴露 `extra`；另两组使用默认 `closed`，声明的 `success=true`。动态字段与完整提取 JSON 一致，均被下游消费；不将无 JSON 自动视为模型请求失败。 | 模型原文、节点 `extractResult`、动态输出、完整 JSON 及最终回显。 |
| C4 | 允许历史时节点可读取自身先前记忆；`history=0` 的普通新调用不复用该节点旧记忆。不同子应用即使节点 ID 相同，也不把另一条调用路径的记忆当成自己的历史。 | 模型实际请求、同一 chat 的记忆键与结果、不同子应用的 source/调用路径。 |
| C5 | 捕获时只走错误出口且根错误计数为 0；未捕获时正常后继不运行且根错误可见。已发生的模型请求和费用按实际结果记录，不把内部 stack 放进未声明输出。 | 错误前后节点集合、错误详情、chat.errorCount、受控服务与用量记录。 |
