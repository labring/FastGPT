---
case_version: 1
id: FG-APP-WORKFLOW-035
title: 工具参数与终止节点的可用连接上下文
business: app/workflow/editor
category: basic
types:
  - ui
scenario: success
priority: P1
status: ready
tags:
  - connection-rules
  - workflow-editor
  - legacy-group-14
  - 覆盖基础场景
  - 覆盖异常场景
evidence:
  - ui
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ToolHandle.tsx
  - packages/global/common/workflow/connection.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
routes: []
related: []
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 工具参数与终止节点的可用连接上下文

## 用例简介

在工作流编辑器中，分别从工具调用节点、工具流程内部和主流程尝试连接工具参数、工具调用终止、循环终止节点。本例检查工具参数可以作为工具挂载，工具调用终止可以接在工具流程内部，而主流程中的普通节点不能直接连接这三类节点。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- Caller 为工具调用；Params、Stop、Break 采用真实工具参数、工具终止、循环终止模板。需要错误位置样例时，先在合法上下文创建并导出完整节点，再按图调整 parentNodeId 后导入，保留必需输入输出。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → Caller → Outer
Caller ⇢ ToolRoot → ToolTail
Params（工具参数配置）、Stop（工具调用终止）、Break（循环终止）独立
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 基础场景；G1 / E0 | 从 Caller 菱形出口实际挂载 Params。 |
| C2 | 基础场景；恢复 G1 | 从 ToolTail 普通出口实际连接 Stop。 |
| C3 | 异常场景；恢复 G1 | 从 Outer 普通出口分别尝试 Params、Stop、Break。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 工具参数配置节点接受工具挂载，仅新增 Caller ⇢ Params。 |
| C2 | 工具流程内部可使用工具终止，仅新增 ToolTail → Stop。 |
| C3 | 三者均拒绝且 E=E0；分别验证仅工具挂载、仅工具流程、仅循环内部的使用范围。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
