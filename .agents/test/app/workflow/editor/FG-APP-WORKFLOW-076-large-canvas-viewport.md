---
case_version: 1
id: FG-APP-WORKFLOW-076
title: 大工作流在小地图导航和缩放中保持节点与连线完整
business: app/workflow/editor
category: boundary
scenario: special
priority: P1
status: ready
types: [ui, e2e]
tags: [workflow-editor, canvas, viewport, minimap, performance]
evidence: [ui]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/canvas/WorkflowCanvas.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/canvas/workflowCanvasContext.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/FlowController.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/WorkflowMiniMap.tsx
  - packages/web/components/common/MySelect/MultipleRowSelect.tsx
routes: []
related: [FG-APP-WORKFLOW-049]
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-076.browser.spec.ts
    items: [C1, C2]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 大工作流在小地图导航和缩放中保持节点与连线完整

## 用例简介

打开有 240 个节点的工作流，放大后画布只挂载附近节点。通过小地图在远端分区间来回导航，节点及其连线重新可见，导出图保留全部配置和坐标。窄视口中，将多选引用入口平移到右边后仍能选择第二列输出。

## 前置准备

- 用本轮测试团队 owner 创建独立工作流，记录应用 ID，结束时删除该应用。用开始节点与文本加工节点组成 240 节点、239 条边的链，均匀排成网格，无模型和外部依赖调用。
- Chromium 视口为 1600×1000 CSS 像素。使用真实画布缩放快捷键和小地图。分别记录导出 JSON、画布 transform、实际挂载的节点 ID、连续动画帧间隔及浏览器错误。
- 帧间隔只记录实际运行观测。跨机器对比需要同硬件、同浏览器和同构建模式的基线。
- C2 使用 920×820 CSS 像素视口。创建 Start → 文本拼接 Producer → 用户选择 Picker。将 Picker 的选项设为引用模式，初始无选中值。Producer 使用较长的名称。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 大图，初始未编辑 | 导出初始图。放大画布，经小地图分别定位左上和右下，再回到左上。保留各次定位后的挂载和两端边截图。重新 Fit View 并导出图。 |
| C2 | 窄视口，Picker 未选变量 | 平移使引用触发器右缘距视口右边约 24 像素。展开菜单，选择 Producer，再点第二列的“拼接结果”。关闭菜单，恢复 1600×1000 视口后导出图。 |

## 预期结果

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、导出 JSON | 放大后两端无需同时全量挂载。左上可见开始节点和其出边，右下可见末节点和其入边，返回后左上节点及边恢复。前后导出的 240 个节点及坐标、239 条边的四元组完全相同。 | 两端挂载集合、transform、截图、前后导出、帧间隔和 pageerror 汇总。 |
| C2 | UI、导出 JSON | 第二列的“拼接结果”完整落在视口内且可点击。导出的 Picker 选项值是指向 Producer 输出的单项引用列表。 | 展开两列后的截图、真实导出值断言。 |
