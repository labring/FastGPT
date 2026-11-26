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
  - response
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-030.browser.spec.ts
    items: [C1, C2, C3, C4, C5, C6, C7, C8, C9, C10]
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
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/canvas/useCanvasController.tsx
  - packages/global/common/workflow/editor/runtime/runtime.ts
  - packages/workflow-core/src/validation/index.ts
  - projects/app/src/pageComponents/app/detail/Workflow/Header.tsx
  - projects/app/src/components/core/app/ScheduledTriggerConfig.tsx
  - projects/app/src/pages/api/core/app/create.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeUserSelect.tsx
routes:
  - POST /api/core/app/create
  - POST /api/core/app/version/publish
  - POST /api/v2/chat/completions
related: []
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 循环与并行容器的连接范围和节点限制

## 用例简介

在包含循环和并行容器的工作流中，验证容器内部、内外之间及两个容器之间的连线规则。旧循环中子节点归属正确、隐藏清单过时的情况下，首次打开后应修复清单，并可进入运行预览和发布确认。

## 前置准备

- 环境：本地 dev、Chromium、中文界面；登录具有本例临时应用写入和删除权限的账号，记录 BASE_URL、appId、teamId、版本和 run 标识。脚本使用仓库外的 `FASTGPT_TEST_STORAGE_STATE`。
- 配置：在应用列表新建临时工作流，普通节点填固定文本。顶部应用更多菜单支持“导入配置”和“导出配置 → 导出 JSON”；模型目录可正常读取。A、B 等是别名，记录实际 nodeId；→ 为普通边，⇢ 为菱形工具挂载。
- 公共基线：每组图准备一次，导出所有 edges 的 (source, sourceHandle, target, targetHandle) 四元组集合 E0。临时画布边 ID 不持久化；比较精确集合/差集，不以边数或刷新后的临时 ID 代替。
- 复位：除明确“承接”的行外，子场景从所指基线开始。参数化行逐个变体执行，失败先保存证据并复位再继续，记录“子场景编号 / 变体”，避免后续失败由脏状态引起。
- Loop 使用当前循环模板（flowNodeType=loopRun），Parallel 使用并行执行模板（flowNodeType=parallelRun），保留模板的系统节点与固定连线。内部节点 parentNodeId 分别指向对应容器；Outer、Loop、Parallel 均位于外层，不设置 parentNodeId，也不挂载到工具流程。
- 导入配置中的内部节点 position 使用画布绝对坐标。等待容器按子节点完成尺寸和位置重算后，再缩放/平移到本次端口清晰可操作的视口；关闭遮挡端口的节点面板或浮层。每次布局或视口变化后重新定位端口，不复用变化前的屏幕坐标。
- P-Select 为并行内历史非法位置样例：先在合法上下文创建用户选择并导出，再将完整节点的 parentNodeId 指向 Parallel 导入。仅编排，不运行。
- E0 记录实际系统边与业务边，不套用旧记录中不完整的节点/边总数。
- C6 单独通过应用创建接口保存 G2。使用当前条件循环模板，保留循环开始和循环终止节点，将父节点隐藏输入 `childrenNodeIdList` 特意设为 `['stale']`，实际子节点通过 `parentNodeId` 指向 Loop。确认详情接口仍返回旧清单后，检查首次打开的编辑状态。
- 证据与清理：按子场景保存 UI、配置快照及所需响应/只读查询；允许路径实际释放建边，拒绝路径同时检查目标不可连接和释放后无新增边。完成后保存证据，通过更多菜单删除本例临时应用；保留失败现场时记录 appId 与原因。

G1：

```text
Start → Loop → Parallel
Outer（外层独立）
Loop 内：L1 → L2；L3、L-Break（循环终止）独立
Parallel 内：P1 → P2；P3、P-Select（用户选择）独立
```

G2：外层 Start → Loop → Exit，Loop 内部 Loop-Start → L1 → L-Break。

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
| C6 | 边界场景；首次载入持久化 G2 | 编辑前导出，检查保存和撤销状态。打开运行预览后关闭，打开发布确认后取消。执行仅保存，核对请求和响应，刷新后再导出。 |
| C7 | 历史兼容；独立的数组循环应用 | 通过创建接口保存历史数组循环，输入为引用模式下的平铺数组 `['first', 'second']`，每轮的回复节点读取循环开始的当前项。打开编辑器导出，用发布接口写入正式版本，读取版本后调用正式聊天接口。 |
| C8 | 历史兼容；容器仅在成员清单记录子节点 | 将独立的旧循环图通过接口写入正式版本。循环子节点不设置 `parentNodeId`，每轮的回复节点读取容器外部文本节点输出。读取正式版本后调用非流式正式聊天接口。 |
| C9 | 历史兼容；根节点父级存为空字符串 | 写入 G2，并加入无连线的根节点 Loose，保存其 `parentNodeId: ''`。打开画布，将 Loose 拖进 Loop，再撤销一次。 |
| C10 | 基础场景；代码沙箱可用 | 创建单次数组循环。让子节点执行会抛出固定错误的代码，捕获边接到循环体内，循环自定义输出引用该子节点的错误，外层回复节点读取该输出。通过画布导出、发布并发起正式聊天。 |

## 预期结果

公共断言：保持类操作要求关系集合不变；新增/删除操作要求差集精确等于目标关系，其他配置按本例约定保留。业务预期拒绝也是符合预期，不能把主标签 scenario=failure 当作实际测试失败。

| 子场景 | 特有预期 |
| --- | --- |
| C1 | L1、P3 的入口在有效拖线期间不可连接，释放后 E=E0；Loop、Parallel 自身入口可连接，每个变体仅新增 Outer → 对应容器的普通关系。原有 Start → Loop、Loop → Parallel 等关系和所有节点的 parentNodeId 均保持，不替换已有入线。 |
| C2 | 同一循环内普通节点和循环终止节点允许连接，仅新增这两条关系，原系统边和业务边保留。 |
| C3 | 同一并行容器内普通节点连接允许，只新增目标关系。 |
| C4 | 两者均不可连接，E=E0；不通过新边隐式改 parentNodeId。 |
| C5 | 交互节点受并行上下文限制而不可连接，E=E0；该规则与普通的跨容器拒绝分开定位。 |
| C6 | 清单恰为 Loop-Start、L1、L-Break，三者归属与图的四条原始连线保持不变。初始页面显示已保存且撤销禁用。运行预览与发布确认可操作。仅保存请求携带修复后的清单，HTTP 和业务 code 均为 200，刷新后导出仍保留修复结果。 |
| C7 | 导出及正式版本均保留原字面量数组。正式聊天 HTTP 200，回复依次包含且仅包含 `first`、`second`。记录导出值、版本回读和实际回复。 |
| C8 | 正式版本只在 `childrenNodeIdList` 保留子节点归属。两轮均可读取外层输出，HTTP 200，回复恰为两个 `outer-value`。记录成员清单、父级字段和实际回复。 |
| C9 | 应用详情仍能读到空字符串父级。拖入后 Loose 的父级为 Loop，原有连线集合保持不变。一次撤销恢复 Loose 的根级归属和位置。 |
| C10 | 导出保留循环自定义输出对直接子节点错误的引用。发布成功，正式聊天 HTTP 200，回复含代码抛出的固定错误。记录引用和值。 |

缺少入口、准备或验证证据时记录对应子场景阻塞，不将其或整个用例标记为通过。
