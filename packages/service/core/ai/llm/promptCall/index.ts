import { getNanoid, sliceJsonStr } from '@fastgpt/global/common/string/tools';
import json5 from 'json5';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool,
  ChatCompletionToolMessageParam
} from '@fastgpt/global/core/ai/llm/type';
import { getPromptToolCallPrompt } from './prompt';
import { maskImagePlaceholderUrl } from '../utils';
import { cloneDeep } from 'lodash-es';

export const promptToolCallMessageRewrite = (
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[]
): ChatCompletionMessageParam[] => {
  const cloneMessages = cloneDeep(messages);

  // Add system prompt too messages
  let systemMessage = cloneMessages.find(
    (item) => item.role === 'system'
  ) as ChatCompletionSystemMessageParam;

  if (!systemMessage) {
    systemMessage = {
      role: 'system',
      content: ''
    };
    cloneMessages.unshift(systemMessage);
  }

  if (typeof systemMessage?.content === 'string') {
    systemMessage.content =
      `${systemMessage.content}\n\n${getPromptToolCallPrompt(tools.map((tool) => tool.function))}`.trim();
  } else if (Array.isArray(systemMessage.content)) {
    systemMessage.content.push({
      type: 'text',
      text: getPromptToolCallPrompt(tools.map((tool) => tool.function))
    });
  } else {
    throw new Error('Prompt call invalid input');
  }

  // 工具内容可能包含图片占位。将每个结果紧跟对应的文本工具调用。
  const encodeToolResult = (
    message: ChatCompletionToolMessageParam
  ): ChatCompletionMessageParam => {
    const toolContent =
      typeof message.content === 'string'
        ? message.content
        : Array.isArray(message.content)
          ? message.content
              .map((part) => {
                if (part.type === 'text') return part.text;
                if (part.type === 'image_url' && part.image_url?.url) {
                  return `[Image: ${maskImagePlaceholderUrl(part.image_url.url)}]`;
                }
                return '';
              })
              .filter(Boolean)
              .join('\n')
          : String(message.content ?? '');
    return { role: 'user', content: `<ToolResponse>\n${toolContent}\n</ToolResponse>` };
  };

  const rewritten: ChatCompletionMessageParam[] = [];
  for (let index = 0; index < cloneMessages.length; ) {
    const message = cloneMessages[index++];
    if (message.role !== 'assistant') {
      rewritten.push(message.role === 'tool' ? encodeToolResult(message) : message);
      continue;
    }

    // 相邻 assistant 可能是同一轮的拆分片段，后面的连续结果按调用 ID 归组。
    const assistants = [message];
    for (
      let next = cloneMessages[index];
      next?.role === 'assistant';
      next = cloneMessages[++index]
    ) {
      assistants.push(next);
    }
    const pendingResults = new Map<string, ChatCompletionToolMessageParam>();
    for (
      let result = cloneMessages[index];
      result?.role === 'tool';
      result = cloneMessages[++index]
    ) {
      pendingResults.set(result.tool_call_id, result);
    }

    for (const { tool_calls, ...assistant } of assistants) {
      const text =
        typeof assistant.content === 'string'
          ? assistant.content
          : assistant.content
              ?.map((part) => (part.type === 'text' ? part.text : part.refusal))
              .join('\n');
      if (text || !tool_calls?.length) {
        rewritten.push(text ? { ...assistant, content: `0: ${text}` } : assistant);
      }
      tool_calls?.forEach((call, callIndex) => {
        // 拆分后的第一条消息携带思考文本，后续片段沿用空思考字段。
        rewritten.push({
          ...assistant,
          content: `1: ${JSON.stringify(call.function)}`,
          reasoning_content:
            assistant.reasoning_content === undefined || (!text && callIndex === 0)
              ? assistant.reasoning_content
              : ''
        });
        const result = pendingResults.get(call.id);
        if (result) {
          rewritten.push(encodeToolResult(result));
          pendingResults.delete(call.id);
        }
      });
    }

    // 兼容未附带调用记录的独立历史工具结果。
    for (const result of pendingResults.values()) {
      rewritten.push(encodeToolResult(result));
    }
  }

  return rewritten;
};

const ERROR_TEXT = 'Tool call error';
export const parsePromptToolCall = (
  str: string
): {
  answer: string;
  streamAnswer?: string;
  toolCalls?: ChatCompletionMessageToolCall[];
} => {
  str = str.trim();
  // 首先，使用正则表达式提取TOOL_ID和TOOL_ARGUMENTS
  const prefixReg = /1(:|：)/;

  if (prefixReg.test(str)) {
    const toolString = sliceJsonStr(str);

    try {
      const toolCall = json5.parse(toolString) as { name: string; arguments: object };

      return {
        answer: '',
        toolCalls: [
          {
            id: getNanoid(),
            type: 'function' as const,
            function: {
              name: toolCall.name,
              arguments: JSON.stringify(toolCall.arguments)
            }
          }
        ]
      };
    } catch {
      if (prefixReg.test(str)) {
        return {
          answer: `${ERROR_TEXT}: ${str}`,
          streamAnswer: `${ERROR_TEXT}: ${str}`
        };
      } else {
        return {
          answer: str,
          streamAnswer: str
        };
      }
    }
  } else {
    const firstIndex = str.indexOf('0:') !== -1 ? str.indexOf('0:') : str.indexOf('0：');
    if (firstIndex > -1 && firstIndex < 6) {
      str = str.substring(firstIndex + 2).trim();
    }

    return { answer: str };
  }
};
