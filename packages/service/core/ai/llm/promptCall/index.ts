import { getNanoid, sliceJsonStr } from '@fastgpt/global/common/string/tools';
import json5 from 'json5';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/type';
import { getPromptToolCallPrompt } from './prompt';
import { cloneDeep } from 'lodash';

export const promptToolCallMessageRewrite = (
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[]
) => {
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

  /* 
    Format tool messages, rewrite assistant/tool message
    1. Assistant, not tool_calls: skip
    2. Assistant, tool_calls: rewrite to assistant text
    3. Tool: rewrite to user text
  */
  for (let i = 0; i < cloneMessages.length; i++) {
    const message = cloneMessages[i];
    if (message.role === 'assistant') {
      if (message.content && typeof message.content === 'string') {
        message.content = `0: ${message.content}`;
      } else if (message.tool_calls?.length) {
        message.content = `1: ${JSON.stringify(message.tool_calls[0].function)}`;
        delete message.tool_calls;
      }
    } else if (message.role === 'tool') {
      cloneMessages.splice(i, 1, {
        role: 'user',
        content: `<ToolResponse>\n${message.content}\n</ToolResponse>`
      });
    }
  }

  return cloneMessages;
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
      const toolCall = json5.parse(toolString) as { name: string; arguments: Object };

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
    } catch (error) {
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
