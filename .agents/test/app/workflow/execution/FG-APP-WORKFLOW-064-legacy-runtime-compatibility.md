---
case_version: 1
id: "FG-APP-WORKFLOW-064"
title: "历史子应用、循环与问题优化节点兼容运行"
business: "app/workflow/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P1
status: draft
tags: [workflow-runtime, legacy, child-workflow, loop, query-extension, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/constants.ts
  - packages/service/core/workflow/dispatch/abandoned/runApp.ts
  - packages/service/core/workflow/dispatch/abandoned/runLoop.ts
  - packages/service/core/workflow/dispatch/abandoned/queryExternsion.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/test/core/workflow/loopTest.json
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-056, FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-062]
automation: []
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 历史子应用、循环与问题优化节点兼容运行

## 用例简介

运行内核仍保留部分已弃用节点，以便用户已有工作流继续执行。对同一份真实历史图比较升级前后结果，验证迁移 Context 后这些入口仍按自己的兼容语义运行，而不是被误当作新版节点。

## 前置准备

- 使用隔离团队及 Mac Mini 的独立 Mongo/PG 测试库和 Redis DB；主站与 Pro 指向该环境，不在本机新建数据库、容器或卷，也不清理 Dev 业务数据。对照版本和本 PR 分别启动可辨识实例，记录各自提交与环境配置。
- **阻塞项：**`packages/service/test/core/workflow/loopTest.json` 仅可作为旧循环结构线索，尚未证明可直接从当前页面导入；旧 `runApp` 和 `queryExtension` 缺少已核实的可导入历史导出。取得包含真实节点、端口及版本信息的脱敏历史图，并在对照版本成功导入运行后，才可将对应变体设为可执行；不得伪造当前节点替代历史节点。
- 为每张历史图创建本轮副本，绑定隔离团队可访问的子应用、模型和受控 HTTP 服务；保留原始导出、转换后图、资源版本及初始变量。模型确定性变体使用隔离环境的受控外部服务，不替换生产回调。每变体新 chatId，暂停与恢复沿用原 chatId。
- 通过实际页面或 `POST /api/v2/chat/completions` 调用，最长等待 120 秒；比较同图对照版本与本 PR 的最终输出、节点执行顺序、变量、详情和用量。数据库只读查询按本轮 teamId/sourceType/appId/chatId 限定；清理仅针对本轮创建的资源 ID。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 旧子应用；历史 `runApp` 图 | 父流程传入已配置变量和问题，子应用更新同名变量并返回内容；再以空问题触发错误。分别在对照版本与本 PR 使用相同绑定和新会话运行。 |
| C2 | 旧循环；历史 `loop` 图 | 以空数组和 `[0,false,""]` 运行有正常出口的循环；另在第二项暂停后提交交互并恢复，比较运行顺序、结果与父变量。 |
| C3 | 旧问题优化；历史 `queryExtension` 图 | 受控模型返回与原问题只在空格/标点上不同的改写及一个不同改写，记录模型请求、节点 JSON 文本输出和后继消费；另以空问题对照错误。 |

## 预期结果

公共断言：先记录对照版本实际行为并核对兼容契约；存在真实差异时报告，不通过更改旧图类型把两边做成相同。旧节点已知共享运行图/暂停状态的行为不自动套用新版 LoopRun 的副本隔离或不可变对象承诺。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 合法调用返回子应用实际文本和历史，子应用的独立变量变更不直接覆盖父变量；空问题报错，不调用子应用。 | 对照与 PR 的父子输入、输出、变量快照及响应树。 |
| C2 | 每个实际输入按顺序进入旧循环并被结果消费；暂停恢复使用真实返回的交互状态。对于旧实现已知的可变共享行为记录对照，不额外宣称新版隔离能力。 | 输入、执行记录、恢复消息、结果数组和变量差集。 |
| C3 | 返回的文本可解析为 JSON 数组，包含原始问题，忽略空格/标点后重复的改写不重复出现；空问题不调用模型并返回错误。 | 受控模型调用、解析后的数组、下游回显和用量。 |
