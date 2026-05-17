import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';

const formatMessagesForCheckpoint = (messages: ChatCompletionMessageParam[]) =>
  JSON.stringify(
    messages.map((message) => ({
      role: message.role,
      content: message.content,
      reasoning_content: message.reasoning_content,
      tool_calls: message.role === 'assistant' ? message.tool_calls : undefined,
      tool_call_id: message.role === 'tool' ? message.tool_call_id : undefined
    })),
    null,
    2
  );

export const getCompressRequestMessagesPrompt = async () => {
  return `你是 Agent 历史上下文 checkpoint 压缩专家。你的任务是把用户提供的对话历史压缩成一段可继续工作的上下文摘要 string。

## 输出要求

1. 只输出一个 <context_checkpoint>...</context_checkpoint> 文本块。
2. 不要输出 JSON，不要输出 Markdown 代码块，不要输出解释。
3. 旧工具调用只总结关键结果，不保留 tool_call_id，不伪造工具执行。

## 必须保留的信息

- 用户长期目标和当前任务
- 用户明确约束、偏好、禁止事项
- 已完成的工作、已做决策、失败但影响后续选择的尝试
- 关键事实、数据、文件名、资源名、接口名、错误信息
- 值得记住的工具结果和结论
- 未解决问题、下一步应做事项

## 忠实性要求

- 不要添加原文不存在的事实。
- 不确定的信息必须标注为不确定。
- 可以概括和重组表达，但不能改变事实、数字、名称、状态。

## 输出模板

<context_checkpoint>
# Context Checkpoint

## User Goal

## Current Task

## Important Constraints

## Decisions Made

## Facts / Data To Preserve

## Tool Results Worth Remembering

## Files / Resources Mentioned

## Open Questions

## Next Steps
</context_checkpoint>`;
};

export const getCompressRequestMessagesUserPrompt = async ({
  messages
}: {
  messages: ChatCompletionMessageParam[];
}) => {
  return `<histories>
${formatMessagesForCheckpoint(messages)}
</histories>

请执行历史上下文 checkpoint 压缩，只输出 <context_checkpoint>...</context_checkpoint>。
`;
};

export const getCompressLargeContentPrompt = async () => {
  return `你是一个文本压缩专家。请在保留关键信息的前提下，尽量精简用户提供的文本。

## 压缩原则

1. 只能删除信息，不能添加原文不存在的信息。
2. 保留关键内容：数据、数字、名称、日期、核心结论、错误信息。
3. 删除冗余：重复描述、冗长修饰语、空泛过渡句。
4. 精简表达：用简练语言、列表、概括替代详细说明。

## 输出要求

只输出压缩后的文本内容，不要包含解释、前后缀说明或 Markdown 代码块标记。`;
};

export const getCompressLargeContentUserPrompt = async ({ content }: { content: string }) => {
  return `<content>
${content}
</content>

请执行压缩操作。`;
};
