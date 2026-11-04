---
case_version: 1
id: FG-APP-WORKFLOW-013
title: 条件出口的受控回流与串行旁路
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
  - legacy-group-03
  - legacy-group-05
  - legacy-group-06
  - legacy-group-07
  - legacy-group-08
  - 覆盖基础场景
  - 覆盖边界场景
  - 覆盖异常场景
evidence:
  - ui
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse/index.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCQNode.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeUserSelect.tsx
  - packages/workflow-core/src/edge/compiler.ts
routes: []
related:
  - FG-APP-WORKFLOW-007
  - FG-APP-WORKFLOW-014
  - FG-APP-WORKFLOW-016
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 条件出口的受控回流与串行旁路

## 用例简介

在包含判断器、问题分类或用户选择节点的工作流中，尝试将后续节点连回上游。本例检查经过条件出口的回流可以建立，动态选项使用共享出口时也遵守这一规则；如果还存在绕过条件的串行路径，则应拒绝会形成纯串行回环的连接。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- 准备 Branch 的三种手动配置：判断器的有效 branchId=continue 与 ELSE；问题分类的 continue/exit；用户选择的 continue/exit。判断条件有效，分类与选项文本非空，本例只编排，不执行模型。
- 动态变体将用户选择的选项输入切成变量引用，引用开始节点选项数组 [{"key":"a","value":"A"},{"key":"b","value":"B"}]，使用 ref_default 共享出口。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → A → Branch
Branch[continue] → C
Branch[ELSE 或 exit] → Exit
```

G2（动态变体）：

```text
Start → A → Branch[ref_default] → C
Exit（独立）
```

G3（判断器串行旁路）：

```text
Start → A → Branch
Branch[continue] → C
Branch[ELSE] → Exit
A → Plain → C
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 基础场景；G1 的判断器、问题分类、手动用户选择变体分别复位 | 先实际连接 C → A；复位后再从 Branch[continue] 直接连接 A。 |
| C2 | 边界场景；G2 / E0 | 实际连接 C → A；复位后从 Branch[ref_default] 连接 A。 |
| C3 | 异常场景；G3 / E0 | 从 C 尝试连接 A。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 两种回流在三个变体下均允许，分别只新增目标边；不重复自连和重复边的通用检查。 |
| C2 | 共享出口控制回流，两种连接分别允许；不会按尚未求值的选项生成多套独立出口。此处不验证动态选项的后端求值。 |
| C3 | 拒绝该候选，E=E0；A → Plain → C 绕过条件，仍会形成纯串行环。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
