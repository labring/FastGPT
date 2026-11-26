---
case_version: 1
id: FG-APP-WORKFLOW-001
title: 主流程、工具流程与嵌套工具的连接隔离
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
  - legacy-group-00
  - legacy-group-15
  - 覆盖异常场景
  - 覆盖基础场景
  - 覆盖边界场景
evidence:
  - ui
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - packages/global/common/workflow/connection.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
routes: []
related:
  - FG-APP-WORKFLOW-003
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 主流程、工具流程与嵌套工具的连接隔离

## 用例简介

在工作流编辑器中，为主流程、多个工具流程以及嵌套工具流程尝试新增连线。本例检查节点能否只在所属流程内连接：不同流程之间的连线应被拦截，工具流程则应能连接尚未归属任何流程的独立节点，并将其纳入当前工具流程。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- G1 使用两个工具调用及三个工具入口，所有普通节点填入固定文本；G2 使用嵌套调用。节点位置不能代替流程归属。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → CallerA → Outer
Start → CallerB
CallerA ⇢ ToolA → A-Mid → A-Tail
CallerA ⇢ ToolB → B-Tail
CallerB ⇢ ToolC
Free（独立）
```

G2：

```text
Start → Caller → Outer
Caller ⇢ ToolRoot → ToolTail → NestedCaller
NestedCaller ⇢ InnerRoot → InnerTail
Free（独立）
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 异常场景；G1 / E0 | 分别尝试 Outer → A-Mid、ToolA → Outer、ToolA → B-Tail，覆盖主→工具、工具→主、不同工具流程三个方向。 |
| C2 | 基础场景；恢复 G1 | 从 ToolA 普通出口实际连接 Free。 |
| C3 | 边界场景；G2 / E0 | 从 InnerTail 普通出口尝试连接祖先工具流程的 ToolTail。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 三个代表目标均不可连接；释放后 E=E0，不替换已有关系。 |
| C2 | Free 可连接；只新增 ToolA → Free，未改动其他边，Free 成为该工具流程的一部分。 |
| C3 | 嵌套不放宽作用域，目标不可连接且 E=E0。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
