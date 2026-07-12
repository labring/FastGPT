import type { AgentMessage } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, StopReason, ToolCall } from '@mariozechner/pi-ai';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentAskPayload } from '../../domain/systemTool/ask';

/** 将工具参数稳定序列化；不可序列化值回退为空对象，避免中断事件链。 */
export const stringifyJson = (value: unknown) => {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
};

/** 将 pi 工具参数收敛为普通对象，屏蔽空值和数组输入。 */
export const normalizeToolArgs = (args: unknown): Record<string, any> =>
  args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, any>) : {};

/** 创建 AgentLoop 使用的标准 OpenAI function tool call。 */
export const createToolCall = ({
  id,
  name,
  args
}: {
  id: string;
  name: string;
  args: unknown;
}): ChatCompletionMessageToolCall => ({
  id,
  type: 'function',
  function: { name, arguments: stringifyJson(args) }
});

/** 判断 pi 消息是否为 assistant message，并为调用方提供类型收窄。 */
export const isAssistantMessage = (message: unknown): message is AssistantMessage =>
  !!message && typeof message === 'object' && (message as { role?: string }).role === 'assistant';

const getMessageText = (message?: ChatCompletionMessageParam) => {
  if (!message || !('content' in message) || !message.content) return '';
  if (typeof message.content === 'string') return message.content;
  return message.content.map((item) => (item.type === 'text' ? item.text : '')).join('');
};

const getPromptFromMessages = (messages: ChatCompletionMessageParam[]) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === ChatCompletionRequestMessageRoleEnum.User) return getMessageText(message);
  }
  return '';
};

/** 在 ask 恢复时生成明确的继续指令；普通调用直接使用最后一条用户消息。 */
export const getPiAgentPrompt = ({
  messages,
  pendingAsk,
  userAnswer
}: {
  messages: ChatCompletionMessageParam[];
  pendingAsk?: AgentAskPayload;
  userAnswer?: string;
}) => {
  if (!pendingAsk || userAnswer === undefined) return getPromptFromMessages(messages);

  return [
    'Continue the previous pending ask_user with the user answer below.',
    '',
    `<ask_user_question>${pendingAsk.question}</ask_user_question>`,
    pendingAsk.reason ? `<ask_user_reason>${pendingAsk.reason}</ask_user_reason>` : '',
    `<user_answer>${userAnswer}</user_answer>`
  ]
    .filter(Boolean)
    .join('\n');
};

/** 从统一消息或 pi providerState 中恢复发生交互暂停的原始工具调用。 */
export const resolveInteractiveToolCall = ({
  toolCallId,
  messages,
  piMessages
}: {
  toolCallId: string;
  messages: ChatCompletionMessageParam[];
  piMessages: AgentMessage[];
}): ChatCompletionMessageToolCall => {
  const call = messages
    .flatMap((message) => (message.role === 'assistant' ? message.tool_calls || [] : []))
    .find((item) => item.id === toolCallId);
  if (call) return call;

  for (const message of piMessages) {
    if (!isAssistantMessage(message) || !Array.isArray(message.content)) continue;
    const toolCall = message.content.find(
      (item) => item.type === 'toolCall' && item.id === toolCallId
    );
    if (toolCall?.type === 'toolCall') {
      return createToolCall({
        id: toolCall.id,
        name: toolCall.name,
        args: normalizeToolArgs(toolCall.arguments)
      });
    }
  }

  return createToolCall({ id: toolCallId, name: '', args: {} });
};

/** 用恢复后的真实结果覆盖 pi-agent-core 保存的交互占位 toolResult。 */
export const replaceInteractiveToolResult = ({
  messages,
  call,
  response,
  isError
}: {
  messages: AgentMessage[];
  call: ChatCompletionMessageToolCall;
  response: string;
  isError: boolean;
}): AgentMessage[] => {
  let replaced = false;
  const nextMessages = messages.map((message) => {
    if (message.role !== 'toolResult' || message.toolCallId !== call.id || replaced) return message;
    replaced = true;
    return { ...message, content: [{ type: 'text' as const, text: response }], isError };
  });
  if (replaced) return nextMessages;

  return [
    ...nextMessages,
    {
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.function.name,
      content: [{ type: 'text', text: response }],
      details: {},
      isError,
      timestamp: Date.now()
    }
  ];
};

type AssistantContentItem = AssistantMessage['content'][number];
type ToolMatchInfo = { properties: Set<string>; required: Set<string> };

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const isEmptyToolArguments = (args: unknown) =>
  !isObjectRecord(args) || Object.keys(args).length === 0;
const isToolCallContent = (item: AssistantContentItem): item is ToolCall =>
  item.type === 'toolCall';

const getToolMatchInfo = (tool: ChatCompletionTool): ToolMatchInfo => {
  const schema = tool.function.parameters as
    | { properties?: Record<string, unknown>; required?: string[] }
    | undefined;
  return {
    properties: new Set(Object.keys(schema?.properties || {})),
    required: new Set(schema?.required || [])
  };
};

const scoreToolArguments = ({
  toolName,
  args,
  toolInfoMap
}: {
  toolName: string;
  args: Record<string, unknown>;
  toolInfoMap: Map<string, ToolMatchInfo>;
}) => {
  const argKeys = Object.keys(args);
  if (argKeys.length === 0) return 0;
  const toolInfo = toolInfoMap.get(toolName);
  if (!toolInfo) return 1;

  const propertyHits = argKeys.filter((key) => toolInfo.properties.has(key)).length;
  const requiredHits = argKeys.filter((key) => toolInfo.required.has(key)).length;
  const hasSchemaKeys = toolInfo.properties.size > 0 || toolInfo.required.size > 0;
  if (hasSchemaKeys && propertyHits === 0 && requiredHits === 0) return -1;
  return propertyHits + requiredHits * 4;
};

/** 修复 pi-agent-core 流式输出中 name 与 arguments 被拆成多个 toolCall 块的情况。 */
const normalizeAssistantToolCalls = ({
  message,
  completionTools = []
}: {
  message: AssistantMessage;
  completionTools?: ChatCompletionTool[];
}) => {
  if (!Array.isArray(message.content)) return;
  const toolInfoMap = new Map(
    completionTools.map((tool) => [tool.function.name, getToolMatchInfo(tool)] as const)
  );
  const normalizedContent: AssistantContentItem[] = [];

  const canMergeIntoToolCall = (
    item: AssistantContentItem,
    args: Record<string, unknown>
  ): item is ToolCall => {
    if (!isToolCallContent(item) || !item.name) return false;
    const score = scoreToolArguments({ toolName: item.name, args, toolInfoMap });
    if (score < 0) return false;
    if (isEmptyToolArguments(item.arguments)) return true;
    return score > 0;
  };

  const findMergeTargetIndex = (args: Record<string, unknown>) => {
    const previousIndex = normalizedContent.length - 1;
    const previousItem = normalizedContent[previousIndex];
    if (previousItem && canMergeIntoToolCall(previousItem, args)) {
      const previousScore = scoreToolArguments({
        toolName: previousItem.name,
        args,
        toolInfoMap
      });
      if (previousScore >= 0) return previousIndex;
    }

    let bestIndex = -1;
    let bestScore = -1;
    normalizedContent.forEach((item, index) => {
      if (!canMergeIntoToolCall(item, args)) return;
      const score = scoreToolArguments({ toolName: item.name, args, toolInfoMap });
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  };

  for (const item of message.content) {
    if (!isToolCallContent(item)) {
      normalizedContent.push(item);
      continue;
    }
    const toolArguments = isObjectRecord(item.arguments) ? item.arguments : {};
    if (item.name) {
      normalizedContent.push({
        ...item,
        id: item.id || `pi_tool_${getNanoid(8)}`,
        arguments: toolArguments
      });
      continue;
    }
    const mergeTargetIndex = findMergeTargetIndex(toolArguments);
    const target = normalizedContent[mergeTargetIndex];
    if (target && isToolCallContent(target)) {
      normalizedContent[mergeTargetIndex] = {
        ...target,
        arguments: {
          ...(isObjectRecord(target.arguments) ? target.arguments : {}),
          ...toolArguments
        }
      };
    }
  }
  message.content = normalizedContent.filter((item) => !isToolCallContent(item) || !!item.name);
};

/** 归一化 pi 消息，确保后续上下文和标准 assistantMessages 使用完整 tool call。 */
export const normalizePiAgentMessages = ({
  messages,
  completionTools = []
}: {
  messages: AgentMessage[];
  completionTools?: ChatCompletionTool[];
}): AgentMessage[] =>
  messages.map((message) => {
    if (!isAssistantMessage(message) || !Array.isArray(message.content)) return message;
    const normalizedMessage: AssistantMessage = { ...message, content: [...message.content] };
    normalizeAssistantToolCalls({ message: normalizedMessage, completionTools });
    return normalizedMessage;
  });

const formatToolCalls = (toolCalls: ToolCall[]): ChatCompletionMessageToolCall[] =>
  toolCalls.map((toolCall) => ({
    id: toolCall.id || `pi_tool_${getNanoid(8)}`,
    type: 'function',
    function: { name: toolCall.name, arguments: stringifyJson(toolCall.arguments) }
  }));

/** 将 pi assistant message 读取成 AgentLoop 标准结束事件所需字段。 */
export const readAssistantMessage = (message: AssistantMessage) => {
  let answerText = '';
  let reasoningText = '';
  const toolCalls: ToolCall[] = [];
  message.content.forEach((item) => {
    if (item.type === 'text') answerText += item.text || '';
    else if (item.type === 'thinking') reasoningText += item.thinking || '';
    else if (item.type === 'toolCall') toolCalls.push(item);
  });
  return { answerText, reasoningText, toolCalls: formatToolCalls(toolCalls) };
};

/** 将 pi stop reason 映射为 AgentLoop 公共 finishReason。 */
export const mapStopReason = (reason?: StopReason): CompletionFinishReason => {
  if (reason === 'toolUse') return 'tool_calls';
  if (reason === 'length') return 'length';
  if (reason === 'error') return 'error';
  if (reason === 'aborted') return 'close';
  return 'stop';
};
