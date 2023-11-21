export const chatNodeSystemPromptTip =
  '模型固定的引导词，通过调整该内容，可以引导模型聊天方向。该内容会被固定在上下文的开头。可使用变量，例如 {{language}}';
export const userGuideTip = '可以在对话前设置引导语，设置全局变量，设置下一步指引';
export const welcomeTextTip =
  '每次对话开始前，发送一个初始内容。支持标准 Markdown 语法，可使用的额外标记:\n[快捷按键]: 用户点击后可以直接发送该问题';
export const variableTip =
  '可以在对话开始前，要求用户填写一些内容作为本轮对话的特定变量。该模块位于开场引导之后。\n变量可以通过 {{变量key}} 的形式注入到其他模块 string 类型的输入中，例如：提示词、限定词等';
