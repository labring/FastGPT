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
const PROMPT_TOOL_CALL_PREFIX_REG = /1(:|：)/;

const findPromptToolAnswerPrefixIndex = (trimmedStr: string) => {
  const asciiIndex = trimmedStr.indexOf('0:');
  return asciiIndex !== -1 ? asciiIndex : trimmedStr.indexOf('0：');
};

const detectPromptToolProtocol = (trimmedStr: string) => {
  const answerPrefixIndex = findPromptToolAnswerPrefixIndex(trimmedStr);
  const toolPrefixIndex = trimmedStr.search(PROMPT_TOOL_CALL_PREFIX_REG);

  // 协议头窗口内优先确认先出现的 0:/0：，避免正文中出现 "11:30" 等文本把普通答复误判成工具调用。
  if (
    answerPrefixIndex > -1 &&
    answerPrefixIndex < 6 &&
    (toolPrefixIndex === -1 || answerPrefixIndex < toolPrefixIndex)
  ) {
    return { type: 'answer' as const, body: trimmedStr.substring(answerPrefixIndex + 2) };
  }

  if (toolPrefixIndex !== -1) {
    return { type: 'tool' as const };
  }

  return { type: 'plain' as const };
};

/**
 * 与 `parsePromptToolCall` 共用同一套协议头规则，判定流式缓冲内容属于工具协议、普通答复还是待继续缓冲。
 */
export const matchPromptToolStreamPrefix = (
  raw: string
): { type: 'pending' | 'tool' } | { type: 'answer' | 'plain'; text: string } => {
  const trimmed = raw.trimStart();
  const protocol = detectPromptToolProtocol(trimmed);

  if (protocol.type === 'answer') {
    const visibleText = protocol.body.trimStart();
    return visibleText ? { type: 'answer', text: visibleText } : { type: 'pending' };
  }

  if (protocol.type === 'tool') {
    return { type: 'tool' };
  }

  // 等待足够的非空白字符；协议头窗口内以 0/1 结尾时（如 "- 1"）继续等待后续冒号。
  if (trimmed.length < 3 || (trimmed.length <= 6 && /[01]$/.test(trimmed))) {
    return { type: 'pending' };
  }

  return { type: 'plain', text: trimmed };
};

export const parsePromptToolCall = (
  str: string
): {
  answer: string;
  streamAnswer?: string;
  toolCalls?: ChatCompletionMessageToolCall[];
} => {
  str = str.trim();
  const protocol = detectPromptToolProtocol(str);

  if (protocol.type === 'answer') {
    return { answer: protocol.body.trim() };
  }

  if (protocol.type === 'tool') {
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
      return {
        answer: `${ERROR_TEXT}: ${str}`,
        streamAnswer: `${ERROR_TEXT}: ${str}`
      };
    }
  }

  return { answer: str };
};
