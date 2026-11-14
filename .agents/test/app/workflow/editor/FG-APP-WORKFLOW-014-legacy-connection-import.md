---
case_version: 1
id: FG-APP-WORKFLOW-014
title: 旧分支与旧方向 Handle 的导入兼容
business: app/workflow/editor
category: boundary
types:
  - ui
scenario: special
priority: P1
status: ready
tags:
  - connection-rules
  - workflow-editor
  - legacy-group-04
  - legacy-group-12
  - 覆盖边界场景
evidence:
  - ui
sources:
  - document/content/guide/build/workflow/rules.mdx
  - packages/workflow-core/src/edge/validation.ts
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/utils.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - packages/global/core/workflow/migration/legacy/workflow.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse/index.tsx
  - packages/workflow-core/src/edge/compiler.ts
  - projects/app/src/web/core/workflow/utils.ts
routes: []
related:
  - FG-APP-WORKFLOW-013
  - FG-APP-WORKFLOW-007
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 旧分支与旧方向 Handle 的导入兼容

## 用例简介

将使用旧版分支标识或端口方向的配置导入当前工作流编辑器，检查原有连线是否完整保留，分支在折叠和展开后是否仍可使用。导入后的图还应遵守当前连接规则：有条件控制的回流可以建立，纯串行回环仍应被拦截。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- 分别从当前编辑器导出下面两组有效配置，仅改指定历史字段，再从应用更多菜单“导入配置”导入。导入完成后重新记录规范化基线 E0，不比较归一化前后的原始 Handle 字符串。
- G1 删除判断器 ifElseList 条件项的 branchId，将对应源 Handle 改为 `<Branch.nodeId>-source-IF`，ELSE 保持 `<Branch.nodeId>-source-ELSE`。
- G2 仅将 A → B 的源和目标 Handle 改为 `<A.nodeId>-source-left`、`<B.nodeId>-target-right`。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → A → Branch
Branch[IF] → C
Branch[ELSE] → Exit
```

G2：

```text
Start → A → B → C
Free（独立）
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 边界场景；导入 G1 | 检查条件项稳定 branchId 与已有边，折叠再展开 Branch。 |
| C2 | 边界场景；导入 G2 | 检查普通端口方向和原串行关系。 |
| C3 | 边界场景；分别恢复两组导入后的 E0 | 在两组图中分别尝试 C → A。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | 缺失 ID 被补为稳定、唯一分支标识；四条语义关系保留，展开折叠不丢端口或边。 |
| C2 | 方向按当前规则归一化，三条语义关系保留；不能以临时边 ID 或旧 Handle 字符串变化判丢线。 |
| C3 | G1 有有效条件出口，允许新增回流；G2 是纯串行路径，拒绝且保留 E0。兼容导入不豁免当前规则。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
