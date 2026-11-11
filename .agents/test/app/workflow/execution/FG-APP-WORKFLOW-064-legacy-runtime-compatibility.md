---
case_version: 1
id: "FG-APP-WORKFLOW-064"
title: "历史子应用、循环与问题优化节点兼容运行"
business: "app/workflow/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P1
status: ready
tags: [workflow-runtime, legacy, child-workflow, loop, query-extension, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/constants.ts
  - packages/service/core/workflow/dispatch/abandoned/runApp.ts
  - packages/service/core/workflow/dispatch/abandoned/runLoop.ts
  - packages/service/core/workflow/dispatch/abandoned/queryExternsion.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/test/core/workflow/loopTest.json
  - .agents/test/app/workflow/execution/fixtures/legacy-run-app.json
  - .agents/test/app/workflow/execution/fixtures/legacy-loop.json
  - .agents/test/app/workflow/execution/fixtures/legacy-loop-pause.json
  - .agents/test/app/workflow/execution/fixtures/legacy-query-extension.json
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-068, FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-062]
automation: []
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 历史子应用、循环与问题优化节点兼容运行

## 用例简介

运行内核仍保留部分已弃用节点，以便用户已有工作流继续执行。对同一份真实历史图比较升级前后结果，验证迁移 Context 后这些入口仍按自己的兼容语义运行，而不是被误当作新版节点。

## 前置准备

- 复用已授权本地 Dev 及配置好的 Mac Mini 数据库，仅操作本轮新建的 FG-TEST 团队、应用及数据清单；不新建本机数据库、容器或卷，不清理 Dev 业务数据。对照版本和本 PR 分别使用可辨识主站入口，记录主站与实际连接 Pro 的提交；禁用启动迁移、全局消费者等无关写操作。
- 同目录四份 `legacy-*.json` 由固定对照提交 `ce796cea84abb5a3708a51c2a5851cbf9d7d6441` 保留的弃用模板构建，真实类型分别是 `app`、`loop`（内部 `loopStart/loopEnd`）、`cfr`，而非新版 `appModule/loopRun/chatNode`。旧循环输入输出与端口另对照仓库历史 `loopTest.json`，补齐正常出口；循环原始模板的元素输出需按旧图声明为 `any`，保留假值。模板是可重复生成的兼容图，不声称来自客户导出；先在对照版本合法发布及运行，再执行同绑定的 PR 对照。
- 为每张图创建本轮副本，绑定本轮可访问的子应用与模型；保存模板来源、最终图、发布 Version/resources 和初始变量。C1 子应用复用 child-leaf，父变量 a=PARENT-BASE；C2 普通旧循环以空数组和 `[0,false,""]` 为同图变体，暂停图按旧节点 1-based index=2 进入表单。每变体新 chatId，暂停与恢复沿用原 chatId；已提交表单会保留在历史中，以叶子 `submitted=true` 和后继完成判断结束，不要求历史交互对象消失。
- C3 基础链路实时调用 Dev 的 DeepSeek-V4.1 Flash。确定性去重变体须记录供应商实际候选（至少一个只差空格/标点的重复项与一个不同项），不能靠 Prompt 要求供应商故意违反自身去重指令。可在取得执行授权后用本轮已采集的真实供应商响应进行受控回放，必须显式标注回放和原始来源；不替换 Workflow callback，不把回放 usage 当作本次实时费用。模型输出先经过最多 3 项候选筛选，再按忽略空格/标点去重，因此不同候选未入选不等于丢失下游输出。
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
