---
case_version: 1
id: FG-APP-WORKFLOW-016
title: 分支与选项编辑时的稳定标识和精确边清理
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
  - legacy-group-05
  - legacy-group-06
  - legacy-group-17
  - 覆盖边界场景
  - 覆盖基础场景
evidence:
  - ui
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCQNode.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeUserSelect.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleDrag.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/useNodeHandleLayout.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse/index.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
routes: []
related:
  - FG-APP-WORKFLOW-013
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 分支与选项编辑时的稳定标识和精确边清理

## 用例简介

在判断器、用户选择和问题分类节点中，调整或删除分支与选项，观察对应端口及连线。本例检查排序和折叠不会改变连线归属，取消排序会保留原顺序，删除某一项只会清理该项的连线；拖动过程中也不应出现重复端口。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- 判断器变体准备有效 continue、second 条件项和 ELSE；用户选择与问题分类变体准备 continue、exit 两项。每项 key/branchId 固定，文本非空；三个变体各记录配置及边快照。
- 拖动时按真实节点中的 `.react-flow__handle.source` 和 `data-handleid` 计数，区分画布真实端口与拖动副本；记录选项/分支配置顺序。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

公共结构：

```text
Start → A → Branch
Branch[continue] → C
Branch[second 或 exit] → Exit
判断器另有 Branch[ELSE] → Exit
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 边界场景；判断器、手动用户选择分别从 E0 开始 | 拖起 continue 排序把手，保持拖动，再结束拖动。 |
| C2 | 边界场景；手动用户选择恢复 E0 | 将 continue 拖到列表外空白处后松开，取消排序。 |
| C3 | 基础场景；判断器、手动用户选择分别恢复 E0 | 在列表内实际交换两个条件项/选项的顺序。 |
| C4 | 基础场景；判断器、用户选择、问题分类各恢复初始配置 | 删除 continue 项。 |
| C5 | 边界场景；仅判断器变体，承接其 C4 | 折叠再展开 Branch。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 真实节点内相同 Handle ID 始终只注册一次；拖动副本不重复端口，已有边保留。 |
| C2 | 顺序仍为 continue、exit，key 与 E0 不变；不把 Escape 键当作本场景已验证入口。 |
| C3 | 配置顺序确实改变，稳定 key/branchId 不变；边仍指向原分支/选项，关系集合等于 E0。 |
| C4 | 只移除 continue 的配置和对应出边；其他选项/分支及其关系保留，比较精确差集。 |
| C5 | 剩余 second 和 ELSE 端口仍可承接原边；配置和 C4 后关系保持，不把视觉隐藏当作删除。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
