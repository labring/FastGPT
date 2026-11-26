---
case_version: 1
id: FG-APP-WORKFLOW-003
title: 工具入口的挂载、独占归属与更换调用者
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
  - legacy-group-00
  - legacy-group-15
  - 覆盖基础场景
  - 覆盖异常场景
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
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ToolHandle.tsx
routes: []
related:
  - FG-APP-WORKFLOW-001
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 工具入口的挂载、独占归属与更换调用者

## 用例简介

在工作流中，将独立节点挂载为工具，再尝试由其他工具调用节点接管、解除挂载后重新绑定，以及在嵌套工具中挂载节点。本例检查一个工具入口只能归属一个调用者，已有普通入线的节点和祖先流程中的节点不能被直接挂载；明确解除原挂载后，应能更换调用者。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- G1 的 CallerA、CallerB 为工具调用节点；Free 没有入线。G2 用于祖先挂载限制，和 G1 独立准备。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → CallerA → Outer
Start → CallerB
CallerA ⇢ ToolA → A-Mid
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
| C1 | 基础场景；G1 / E0 | 从 CallerA 菱形出口实际挂载 Free，记录配置 D1。 |
| C2 | 异常场景；承接 C1 / D1 | 从 CallerB 尝试挂载 Free。 |
| C3 | 异常场景；恢复 G1 | 从 CallerA 尝试挂载已有普通入线的 A-Mid。 |
| C4 | 边界场景；恢复 G1 | 先显式删除 CallerB ⇢ ToolC，再将 ToolC 挂载到 CallerA。 |
| C5 | 边界场景；G2 / E0 | 从 NestedCaller 挂载独立 Free 作为允许对照，再尝试挂载 Caller、ToolRoot。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 仅新增 CallerA ⇢ Free，Free 归 CallerA。 |
| C2 | 拒绝抢占，D1 保持；不自动删除或替换 CallerA ⇢ Free。 |
| C3 | 不能用工具挂载覆盖普通入线，E=E0。 |
| C4 | 第一步仅删除原挂载；第二步仅新增 CallerA ⇢ ToolC。其余边不变，不要求系统自动换绑。 |
| C5 | Free 挂载成功，祖先流程目标不可挂载；最终只有新增的 NestedCaller ⇢ Free，已有入线和归属约束仍生效。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
