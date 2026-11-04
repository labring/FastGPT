---
case_version: 1
id: FG-APP-WORKFLOW-007
title: 普通连线的允许、拒绝与拓扑变化
business: app/workflow/editor
category: abnormal
types:
  - ui
scenario: failure
priority: P1
status: ready
tags:
  - connection-rules
  - workflow-editor
  - legacy-group-01
  - legacy-group-02
  - 覆盖异常场景
  - 覆盖基础场景
  - 覆盖边界场景
evidence:
  - ui
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-007.browser.spec.ts
    items: [C1, C2, C3, C4]
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
routes: []
related:
  - FG-APP-WORKFLOW-013
  - FG-APP-WORKFLOW-014
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 普通连线的允许、拒绝与拓扑变化

## 用例简介

在工作流编辑器中，尝试新增普通连线，并在删除中间节点后再次连接。本例检查自连、重复连线和纯串行回环会被拦截，正常分叉与汇合可以建立；删除节点后，连接判断应依据当前图重新计算，允许原本因回环而被拒绝的连接。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 脚本执行时，`FASTGPT_TEST_STORAGE_STATE` 指向仓库外的已登录测试账号状态；脚本使用独立临时应用，完成后通过正常删除接口清理。未提供认证状态时由 AI 补齐环境，不跳过业务断言。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- 本例集中承担普通边的通用拒绝规则，其他业务用例不再重复铺开相同自连、重复目标和所有上游节点。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → A → B → C
Free（独立）
```

G2：

```text
Start → A → B → D
A → C
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 异常场景；G1 / E0 | 参数化尝试 A → A（自连）、A → B（重复同端口）、C → A（串行回环）。每个变体记录独立结果。 |
| C2 | 基础场景；恢复 G1 | 从 A 已连 B 的普通出口再实际连接 C。 |
| C3 | 基础场景；G2 / E0 | 实际连接 D → C。 |
| C4 | 边界场景；恢复 G1 | 删除 B 后，实际连接 C → A。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 三个代表目标均不可连接，释放后 E=E0。分别按同一节点、四元组相同、无条件返回路径判断。 |
| C2 | 允许同出口多目标，只新增 A → C，原三条关系保留。 |
| C3 | 允许无环分支汇合，只新增 D → C，不误判为回环。 |
| C4 | 删除仅移除 B 及 A → B、B → C；Start → A 保留。原回路已断开，C → A 允许，最终关系为 Start → A、C → A。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
