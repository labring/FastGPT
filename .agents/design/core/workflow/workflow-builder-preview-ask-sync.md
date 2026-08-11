# workflowBuilderPreview 确认卡片同步新 ask 样式（复用 AgentAskComposer）

## 背景

- main 上 #7446（fc7603b2c）已将 `AgentAskComposer` 升级为最新 ask 设计（20px 圆角卡片、编号圆圈选项、primary 选中态、胶囊按钮）。
- 本分支（yyh/workflow-core-cli）在 bb87de590 新建 `RenderWorkflowBuilderPreviewInteractive`（workflow 辅助生成的 mermaid 确认卡片），交互区仍使用旧样式 `LeftRadio` + 默认 `Textarea/Button` + 折叠展开。
- 已与用户确认：复用 `AgentAskComposer`，采用最小改动方案；`userSelect`/`userInput` 旧式交互不在本次范围。

## 决策

1. `AgentAskComposer` 是唯一需要功能改造的组件：完成未提交的 `customOptionLabel` / `customOptionPlaceholder` / `customAnswerRequired` 三个 props（修正缩进、修正 `isAdvanceDisabled` 语义），不传新 props 时行为与现状完全一致。
2. `RenderWorkflowBuilderPreviewInteractive` 只做接线：title/mermaid/sections 保持不动，交互区从 `LeftRadio` 替换为 `<AgentAskComposer>`，并补充映射与只读态。
3. 提交协议沿用现状 `onSendPrompt(text, { askId: previewId, optionValue, text? })`；histories 回填、刷新恢复（answerValue/answerText）由 `utils/interactive.ts` 既有逻辑负责，不修改。
4. 只读态（已提交 || 非 lastChild）简化为 `SelectedAnswerText` 纯摘要，不再渲染 LeftRadio / ChoiceCollapseToggleButton，旧样式零残留。
5. 多轮 revise 状态重置：`key={previewId + (answerValue ?? '')}` 强制重挂载。

## 映射

```
question.question          = preview.params.title（删除原独立 title Box，标题进入卡片头部）
question.options           = actions 中 inputMode !== 'text' 的项 → { value, summary: label }
customOptionLabel          = 文本动作（revise）的 label
customOptionPlaceholder    = revise 的 inputPlaceholder
customAnswerRequired       = true（revise 必须填写意见）
```

`onSubmit(answers)` 回填协议：

- `answers[0]` 命中某个非文本动作的 value → `onSendPrompt(label, { askId, optionValue: value })`
- 否则视为 revise 文本 → `onSendPrompt(text, { askId, optionValue: customAction.value, text })`

## 改动文件

| 文件 | 改动 |
|---|---|
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/AgentAskComposer.tsx` | 完成未提交 props：修 Textarea 缩进；`isAdvanceDisabled = isInputDisabled \|\| (customAnswerRequired && !customValue.trim())` |
| `projects/app/src/components/core/chat/components/AIResponseBox/RenderWorkflowBuilderPreviewInteractive.tsx` | 交互区换 AgentAskComposer + 映射；只读态纯摘要；key 重挂载 |

## 边界

- revise 文本恰好等于某个选项 value 时会被按选项提交：接受该边界（选项判定按 value 集合匹配），confirm/cancel 在服务端不接受 text 载荷可兜底。
- 非 lastChild 只读态与现状等价（现状也是禁用态），行为不变。
- AgentAskComposer 首次在响应区（非输入区）渲染：autoFocus/高度测量表现需在编辑器 ChatPanel 与普通对话中实测。

## TODO

- [ ] AgentAskComposer 完成三个 props 与语义修正
- [ ] RenderWorkflowBuilderPreviewInteractive 接线 AgentAskComposer + 只读态
- [ ] 类型检查 + 局部测试
- [ ] 手工验证（编辑器辅助生成全流程 + 普通对话 + 刷新恢复）
