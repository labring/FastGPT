---
case_version: 1
id: FG-APP-WORKFLOW-066
title: 文件上传配置与下游默认引用同步更新
business: app/workflow/editor
category: boundary
scenario: special
priority: P1
status: ready
types: [ui, e2e]
tags: [workflow-editor, file-upload, references, undo, 覆盖边界场景]
evidence: [ui]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/SystemConfigDrawer.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/SystemConfigForm.tsx
  - packages/global/common/workflow/editor/startAutoFill.ts
  - packages/global/common/workflow/editor/runtime/documentModule.ts
routes: []
related: [FG-APP-WORKFLOW-040]
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-066.browser.spec.ts
    items: [C1, C2]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 文件上传配置与下游默认引用同步更新

## 用例简介

编辑工作流时开启或关闭图片上传，开始节点的文件输出及依赖它的自动引用随配置变化。已有手动引用保持原值，撤销一次可恢复整笔变更。

## 前置准备

- 使用本地 Dev 的本轮测试团队 owner 和两个独立工作流。通过实际创建接口准备 `Start → Manual → Chat → Search`，保留返回的应用 ID，通过应用删除接口清理。
- `Manual` 为文本加工，`Chat` 为 AI 对话，`Search` 为知识库搜索。`Chat.userChatInput` 手动引用 `Manual.text`，`Chat.fileUrlList` 与 `Search.datasetSearchInput` 初始为空。仅编辑配置，无需调用模型或知识库。
- 两图初始均关闭上传。C1 的开始节点无 `userFiles`，C2 模拟旧图，开始节点已经包含该输出。
- 每步从画布菜单下载 JSON，读取 `chatConfig.fileSelectConfig`、节点输出、输入引用及四元组连线集合。凭证使用仓库外认证状态。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景，开始节点无文件输出 | 打开系统配置的「文件上传」，仅勾选图片并确认。再次进入，取消勾选图片并确认。点击一次画布撤销。分别导出初态、开启、关闭和撤销后的图。 |
| C2 | 历史兼容，开始节点已有文件输出 | 从独立旧图开始，执行和 C1 相同的开关、撤销与导出步骤。 |

## 预期结果

公共断言：开启后恰有一个 `Start.userFiles`，`Chat.fileUrlList` 为 `[[Start, userFiles]]`，`Search.datasetSearchInput` 同时引用 `Start.userChatInput` 与 `Start.userFiles`。关闭后删除文件输出和对应自动引用，知识库搜索仍引用用户问题。一次撤销恢复开启状态。四份配置中 `Chat.userChatInput` 均为 `[Manual, text]`，节点和连线集合保持一致。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、导出 JSON | 开启时新增文件输出，并填充下游空白输入。 | 四步的配置、引用、输出及连线集合。 |
| C2 | UI、导出 JSON | 开启时复用已有文件输出，仍填充空白输入且没有重复输出。 | 初态已有输出的 JSON 和三步变更后的快照。 |
