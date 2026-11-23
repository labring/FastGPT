---
case_version: 1
id: FG-APP-WORKFLOW-074
title: 节点单步调试结果、交互续跑和配置隔离
business: app/workflow/execution
types: [ui, api, e2e]
category: basic
scenario: success
priority: P1
status: ready
tags: [单步调试, 动态选项, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebugInput.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderDebug/NodeDebugResponse.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/debug/workflowDebugSession.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/ButtonEdge.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/RenderInput/Label.tsx
  - projects/app/src/web/core/workflow/editor/canvas/canvasTypes.ts
  - projects/app/src/web/core/workflow/editor/canvas/projectWorkflowCanvas.ts
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/global/openapi/core/workflow/api.ts
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/tools/runIfElse.ts
  - packages/service/core/workflow/dispatch/interactive/userSelect.ts
routes:
  - POST /api/core/app/create
  - POST /api/core/workflow/debug
  - DELETE /api/core/app/del
related: [FG-APP-WORKFLOW-014, FG-APP-WORKFLOW-040]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
automation:
  - runner: playwright
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-074.browser.spec.ts
    items: [C1, C2, C3, C4, C5, C6]
---

# 节点单步调试结果、交互续跑和配置隔离

## 用例简介

编辑器在画布展示本步调试结果，并允许用户继续下一节点或回应节点提供的选择。手工提交的调试字面量仅用于本轮执行，调试结果和选中态也不进入工作流配置。

## 前置准备

- 使用本地 dev、可写应用的专用测试成员和本轮 Chromium 登录态。每个子场景新建独立工作流，以创建响应登记 appId，用到的都是内置节点，无须调用模型。
- C1 使用开始 → 文本加工 A → 文本加工 B，两加工节点分别返回固定文本。C2 使用开始 → 文本加工 Source → 用户选择 Choice → 文本加工 Tail。Choice 选择引用模式，引用 Source 的文本输出，分支为引用模式通用出口。
- C3 使用两张独立图。线性图为开始 → 文本加工 A → 文本加工 B → 文本加工 C，B→C 使用旧版 `C-target-right`。分支图让 B 成为判断器，仅当 A 的固定文本为 `IF only` 时走 IF。B 的 `B-source-IF` 经旧版 `C-target-right` 连到用户选择 C，`B-source-ELSE` 经当前 `C-target-left` 连到同一个 C。C 的手动选项为 `Continue after ELSE`。从画布实际 SVG 描边读取每条边的颜色。
- C4 使用开始 → 用户选择 Choice。Choice 的第一个手填选项连接文本加工 A、B，第二个选项连接 C。该场景只编辑图。
- C5 使用可用的本地代码沙箱。准备只有一个待执行代码节点的调试请求，引用输入类型为字符串数组，值为 `["removed", "result"]`，不存在该来源。代码把输入数组用 `/` 拼接，空输入时返回 `empty`。
- 在调试前从画布导出基线 JSON。记录每步 debug 请求的节点 ID、输入、chatId、usageId、HTTP 状态及业务响应。每步等待实际响应及画布结果，最长 30 秒。
- 完成本项后通过正常删除应用接口回收所记 appId，核对返回结果。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；线性图 | 悬停 A，在节点操作菜单选择“调试”，保留固定文本后运行。通过结果卡的“下一步”执行 B，再“完成调试”并导出配置。 |
| C2 | 边界；Choice 配置动态引用 | 直接调试 Choice，将选项字段输入 JSON `["Source", "system_text"]`（两个字符串既可作为有效引用标识，也可作为两个字面量选项）。点选 `system_text`，继续 Tail，完成调试并导出配置。 |
| C3 | 历史兼容与分支汇合；线性图和分支图 | 两张图均从 A 开始，依次通过结果卡执行 B、C。执行 A、B 后逐条对照 HTTP 边状态和画布描边。分支图在 C 暂停时再次比对两条边，再点选 `Continue after ELSE` 续跑。完成调试并重新导出配置。 |
| C4 | 边界；两个手填选项的图 | 在 Choice 将选项切到变量引用并导出。撤销一次后重新导出。 |
| C5 | 历史兼容；无有效来源的二元字符串数组 | 向调试 API 发独立请求，引用输入分别省略标记、传 `debugValueOverride: true`、传 `debugValueOverride: false`、传字符串 `debugValueOverride: "true"`。 |
| C6 | 并行交互；开始节点同时连接选择和表单 | 通过单步调试 API 执行开始并推进一次，读取两个暂停节点的入口和入边。先提交选择节点的答案，再提交表单输入。 |

## 预期结果

调试场景 C1 至 C3 的公共断言：调试 API HTTP 200 且业务 code=200。同轮请求保持同一非空 chatId，续步复用首步返回的 usageId。完成后结果卡和调试选中态清除，导出与基线一致。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、HTTP | A、B 的结果分别属于本步运行节点。A 返回下一入口 B，B 返回空下一入口。切到 B 时 A 的结果卡清除，完成时 B 的结果卡清除。 | 两步业务响应、画布结果截图、导出 JSON 对照。 |
| C2 | UI、HTTP | 调试请求标记 `debugValueOverride: true`，依次显示 `Source` 与 `system_text` 两个选项。选择 `system_text` 后响应 `userSelectResult` 为 `system_text`，下一入口为 Tail。保存态仍引用 Source，导出的输入不含调试标记。 | Choice 请求和交互/续跑响应、选择卡截图、导出 JSON 对照。 |
| C3 | UI、HTTP | A 执行后，B→C 响应保留各自的端口 ID，边均为 `waiting`，画布描边为 `#5E8FFF`。B 执行后下一入口为 C。线性边为 `active`，画布描边为 `#487FFF`。分支图走 ELSE，IF 边为 `skipped`（`#8A95A7`），ELSE 边为 `active`（`#487FFF`），C 暂停时两条边保持各自状态。选择后续跑请求针对 C，响应返回 `userSelectResult` 为 `Continue after ELSE`，下一入口为空。两张图的导出均保留原始端点。 | 调试请求及响应、计算后的 SVG 描边、暂停选择卡截图、配置前后对照。 |
| C4 | UI、导出 | A、B 两条边迁移到变量引用出口，第二个选项的 C 边移除。一次撤销恢复全部原端口、连线和手填选项。 | 模式切换前后及撤销后的边四元组与节点配置。 |
| C5 | HTTP | 前三次为 HTTP 200、code=200。省略标记与显式手填时输出 `removed/result`，标记为文档引用时输出 `empty`。字符串标记在请求校验时返回 HTTP 400、code=400。 | 各次请求的标记、业务响应和真实代码节点输出。 |
| C6 | HTTP | 两个节点均有交互响应，入口和活跃入边均保留。选择节点返回 `One` 后只有表单待答。表单返回 `{ "answer": "Done" }` 后无后续入口。 | 暂停、选择续跑和表单续跑的实际响应。 |
