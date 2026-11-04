---
case_version: 1
id: FG-APP-WORKFLOW-030
title: 循环与并行容器的连接范围和节点限制
business: app/workflow/editor
category: boundary
types:
  - ui
scenario: failure
priority: P1
status: ready
tags:
  - connection-rules
  - workflow-editor
  - legacy-group-13
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
  - packages/global/common/workflow/connection.ts
  - packages/global/core/workflow/template/context.ts
  - packages/global/core/workflow/template/system/loopRun/loopRun.ts
  - packages/global/core/workflow/template/system/parallelRun/parallelRun.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/index.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/ConnectionHandle.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useWorkflow.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useNestedNode.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/adapters/command.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/context/workflowComputeContext.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeUserSelect.tsx
routes: []
related: []
baseline: 5a5211f70998f5311cd40b0e5362a1414be6fbdf
---

# 循环与并行容器的连接范围和节点限制

## 用例简介

在包含循环和并行容器的工作流中，分别尝试容器内部、内外之间及两个容器之间的连线。本例检查同一容器内允许的连接可以建立，外层节点应通过容器自身入口连接，跨作用域连线会被拦截；同时确认循环内部可以连接循环终止节点，并行内部不能连接用户选择节点。

## 前置准备

- 环境：独立测试实例、Chrome、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- Loop 使用当前循环模板（flowNodeType=loopRun），Parallel 使用并行执行模板（flowNodeType=parallelRun），保留模板的系统节点与固定连线。内部节点 parentNodeId 分别指向对应容器；Outer、Loop、Parallel 均位于外层，不设置 parentNodeId，也不挂载到工具流程。
- 导入配置中的内部节点 position 使用画布绝对坐标。等待容器按子节点完成尺寸和位置重算后，再缩放/平移到本次端口清晰可操作的视口；关闭遮挡端口的节点面板或浮层。每次布局或视口变化后重新定位端口，不复用变化前的屏幕坐标。
- P-Select 为并行内历史非法位置样例：先在合法上下文创建用户选择并导出，再将完整节点的 parentNodeId 指向 Parallel 导入。仅编排，不运行。
- E0 记录实际系统边与业务边，不套用旧记录中不完整的节点/边总数。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → Loop → Parallel
Outer（外层独立）
Loop 内：L1 → L2；L3、L-Break（循环终止）独立
Parallel 内：P1 → P2；P3、P-Select（用户选择）独立
```

## 测试步骤

按场景表执行。公共准备只做一次，场景之间按“起始状态”复位或承接；同一行的多个节点/参数变体复用同一判定方法。

拖线时先悬停或选中源节点，等待普通出口可见，再按住出口移动，确认候选连线已经出现后检查目标入口。未拖线时入口隐藏是正常显示状态，不能据此判定连接被拒绝。未能启动候选线时，记录源端口可见性、实际坐标与遮挡情况，使用浏览器原生指针操作复核：操作条件不足记执行阻塞，真实用户操作仍无法起拖则记 UI 失败，均不推断目标连接规则。不能通过直接调用规则函数或写入图状态代替 UI 建边。

| 子场景 | 类型与起始状态 | 操作差异 |
| --- | --- | --- |
| C1 | 边界场景；每个变体恢复 G1 / E0 | 从 Outer 的普通出口分别拖向 L1、P3 的内部普通入口，以及 Loop、Parallel 容器自身的外部普通入口；四个变体均实际释放。按实际 nodeId 和端口类型定位，容器入口不使用内部开始节点或顶部菱形工具入口。 |
| C2 | 基础场景；恢复 G1 | 从 L1 分别连接 L3 与 L-Break。 |
| C3 | 基础场景；恢复 G1 | 实际连接 P1 → P3。 |
| C4 | 边界场景；恢复 G1 | 从 L1 分别尝试连接 Outer 与 P3，覆盖内部→外层和跨容器两个方向。 |
| C5 | 边界场景；恢复 G1 | 从 P1 尝试连接同容器的 P-Select。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | L1、P3 的入口在有效拖线期间不可连接，释放后 E=E0；Loop、Parallel 自身入口可连接，每个变体仅新增 Outer → 对应容器的普通关系。原有 Start → Loop、Loop → Parallel 等关系和所有节点的 parentNodeId 均保持，不替换已有入线。 |
| C2 | 同一循环内普通节点和循环终止节点允许连接，仅新增这两条关系，原系统边和业务边保留。 |
| C3 | 同一并行容器内普通节点连接允许，只新增目标关系。 |
| C4 | 两者均不可连接，E=E0；不通过新边隐式改 parentNodeId。 |
| C5 | 交互节点受并行上下文限制而不可连接，E=E0；该规则与普通的跨容器拒绝分开定位。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
