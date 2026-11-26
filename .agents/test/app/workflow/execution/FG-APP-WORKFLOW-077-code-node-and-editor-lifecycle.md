---
case_version: 1
id: FG-APP-WORKFLOW-077
title: 代码节点调试和编辑器重挂载后的内容一致性
business: app/workflow/execution
types: [ui, api, integration]
category: boundary
scenario: success
priority: P1
status: ready
tags: [代码节点, Monaco, JavaScript, Python, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response]
sources:
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeCode/index.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/FlowController.tsx
  - packages/global/core/workflow/template/system/sandbox/index.ts
  - packages/web/components/common/Textarea/CodeEditor/Editor.tsx
  - packages/web/components/common/Textarea/CodeEditor/index.tsx
  - packages/web/components/common/Textarea/monacoModelRegistry.ts
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/service/core/workflow/dispatch/tools/codeSandbox.ts
routes:
  - GET /api/core/workflow/getSandboxPackages
  - POST /api/core/app/create
  - POST /api/core/workflow/debug
  - DELETE /api/core/app/del
related: [FG-APP-WORKFLOW-074]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 代码节点调试和编辑器重挂载后的内容一致性

## 用例简介

工作流的 JavaScript 和 Python 节点可接受文本输入并把处理结果用于下游。放大编辑、折叠节点或切换画布演示模式后，编辑器重挂载时应读取当前节点的代码，保留其他节点的内容。

## 前置准备

- 使用本地 dev、可创建和删除应用的专用测试成员以及本轮 Chromium 登录态。创建从开始节点分流到 `JavaScript Code`、`Python Code` 的测试图，两节点的 `data1` 绑定开始节点的用户问题输出，以 `result` 作为返回字段。记录 appId，两个子场景分别使用新应用。
- JavaScript 写 `function main({data1}){ return {result:data1 + ' JS'}; }`，Python 写 `def main(data1: str):` 并返回 `{'result': data1 + ' PY'}`。只操作文本，不访问系统、网络或文件。
- C1 需要运行时实例的 `codeSandboxEnabled` 为 true 并能调用 Code Sandbox；C2 只需要首次 Monaco 模型可用。页面和每次调试 API 各最多等待 30 秒，按实际元素可见和流程终态执行。
- 调试只记录临时图请求和业务响应。结束后通过已知删除接口回收本轮 appId，并保存删除证据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；独立初始图 | 分别打开两种语言节点的正常调试表单。输入 `FG-TEST scalar` 后提交并查看结果，完成各自调试。 |
| C2 | 边界；另一份初始图 | 放大 JavaScript 编辑器，把 ` JS` 改为 ` JS updated` 后确认关闭。记录节点内联代码，折叠并展开该节点；切换演示模式再回编辑模式。每次确认真实卸载与重挂载后分别检查两种语言的显示，最终导出图。 |

## 预期结果

公共断言：只修改当前代码字段，节点 ID、其他节点代码及上下游关系保持原值。每个场景都用可见节点内容和实际服务结果或导出配置相互印证。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、HTTP、真实 Code Sandbox | 两次分别用 `codeType: js` 和 `codeType: py`，实际解析的 `customInputs.data1` 均为字符串 `FG-TEST scalar`，实际输出分别为 `FG-TEST scalar JS` 与 `FG-TEST scalar PY`，节点显示“运行成功”。 | 双语言调试请求响应与结果卡截图。 |
| C2 | UI、导出 | 模态编辑器关闭后内联文本更新。折叠时 JS Monaco DOM 被卸载，展开后显示本轮文本；演示模式两模型视图均卸载，返回编辑后分别恢复其文本。导出的 JS 代码仅有指定修改，Python 内容和语言保持原值。 | 卸载/恢复快照、两语言文本和图配置差集。 |
