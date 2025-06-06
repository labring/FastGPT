import { type LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  CompletionFinishReason,
  StreamChatType,
  UnStreamChatType,
  CompletionUsage,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/type';
import { getLLMModel } from './model';
import { getLLMDefaultUsage } from '@fastgpt/global/core/ai/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import json5 from 'json5';

/* 
  Count response max token
*/
export const computedMaxToken = ({
  maxToken,
  model,
  min
}: {
  maxToken?: number;
  model: LLMModelItemType;
  min?: number;
}) => {
  if (maxToken === undefined) return;

  maxToken = Math.min(maxToken, model.maxResponse);
  return Math.max(maxToken, min || 0);
};

// FastGPT temperature range: [0,10], ai temperature:[0,2],{0,1]……
export const computedTemperature = ({
  model,
  temperature
}: {
  model: LLMModelItemType;
  temperature: number;
}) => {
  if (typeof model.maxTemperature !== 'number') return undefined;
  temperature = +(model.maxTemperature * (temperature / 10)).toFixed(2);
  temperature = Math.max(temperature, 0.01);

  return temperature;
};

type CompletionsBodyType =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;
type InferCompletionsBody<T> = T extends { stream: true }
  ? ChatCompletionCreateParamsStreaming
  : T extends { stream: false }
    ? ChatCompletionCreateParamsNonStreaming
    : ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;

export const llmCompletionsBodyFormat = <T extends CompletionsBodyType>(
  body: T & {
    stop?: string;
  },
  model: string | LLMModelItemType
): InferCompletionsBody<T> => {
  const modelData = typeof model === 'string' ? getLLMModel(model) : model;
  if (!modelData) {
    return body as unknown as InferCompletionsBody<T>;
  }

  const response_format = (() => {
    if (!body.response_format?.type) return undefined;
    if (body.response_format.type === 'json_schema') {
      try {
        return {
          type: 'json_schema',
          json_schema: json5.parse(body.response_format?.json_schema as unknown as string)
        };
      } catch (error) {
        throw new Error('Json schema error');
      }
    }
    if (body.response_format.type) {
      return {
        type: body.response_format.type
      };
    }
    return undefined;
  })();

  const stop = body.stop ?? undefined;

  const requestBody: T = {
    ...body,
    model: modelData.model,
    temperature:
      typeof body.temperature === 'number'
        ? computedTemperature({
            model: modelData,
            temperature: body.temperature
          })
        : undefined,
    ...modelData?.defaultConfig,
    response_format,
    stop: stop?.split('|')
  };

  // field map
  if (modelData.fieldMap) {
    Object.entries(modelData.fieldMap).forEach(([sourceKey, targetKey]) => {
      // @ts-ignore
      requestBody[targetKey] = body[sourceKey];
      // @ts-ignore
      delete requestBody[sourceKey];
    });
  }

  return requestBody as unknown as InferCompletionsBody<T>;
};

export const llmStreamResponseToAnswerText = async (
  response: StreamChatType
): Promise<{
  text: string;
  usage?: CompletionUsage;
  toolCalls?: ChatCompletionMessageToolCall[];
}> => {
  let answer = '';
  let usage = getLLMDefaultUsage();
  let toolCalls: ChatCompletionMessageToolCall[] = [];
  let callingTool: { name: string; arguments: string } | null = null;

  for await (const part of response) {
    usage = part.usage || usage;
    const responseChoice = part.choices?.[0]?.delta;

    const content = responseChoice?.content || '';
    answer += content;

    // Tool calls
    if (responseChoice?.tool_calls?.length) {
      responseChoice.tool_calls.forEach((toolCall, i) => {
        const index = toolCall.index ?? i;

        // Call new tool
        const hasNewTool = toolCall?.function?.name || callingTool;
        if (hasNewTool) {
          // 有 function name，代表新 call 工具
          if (toolCall?.function?.name) {
            callingTool = {
              name: toolCall.function?.name || '',
              arguments: toolCall.function?.arguments || ''
            };
          } else if (callingTool) {
            // Continue call(Perhaps the name of the previous function was incomplete)
            callingTool.name += toolCall.function?.name || '';
            callingTool.arguments += toolCall.function?.arguments || '';
          }

          if (!callingTool) {
            return;
          }

          // New tool, add to list.
          const toolId = getNanoid();
          toolCalls[index] = {
            ...toolCall,
            id: toolId,
            type: 'function',
            function: callingTool
          };
          callingTool = null;
        } else {
          /* arg 追加到当前工具的参数里 */
          const arg: string = toolCall?.function?.arguments ?? '';
          const currentTool = toolCalls[index];
          if (currentTool && arg) {
            currentTool.function.arguments += arg;
          }
        }
      });
    }
  }
  return {
    text: removeDatasetCiteText(parseReasoningContent(answer)[1], false),
    usage,
    toolCalls
  };
};
export const llmUnStreamResponseToAnswerText = async (
  response: UnStreamChatType
): Promise<{
  text: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  usage?: CompletionUsage;
}> => {
  const answer = response.choices?.[0]?.message?.content || '';
  const toolCalls = response.choices?.[0]?.message?.tool_calls;

  return {
    text: removeDatasetCiteText(parseReasoningContent(answer)[1], false),
    usage: response.usage,
    toolCalls
  };
};
export const formatLLMResponse = async (response: StreamChatType | UnStreamChatType) => {
  if ('iterator' in response) {
    return llmStreamResponseToAnswerText(response);
  }
  return llmUnStreamResponseToAnswerText(response);
};

// Parse <think></think> tags to think and answer - unstream response
export const parseReasoningContent = (text: string): [string, string] => {
  const regex = /<think>([\s\S]*?)<\/think>/;
  const match = text.match(regex);

  if (!match) {
    return ['', text];
  }

  const thinkContent = match[1].trim();

  // Add answer (remaining text after think tag)
  const answerContent = text.slice(match.index! + match[0].length);

  return [thinkContent, answerContent];
};

export const removeDatasetCiteText = (text: string, retainDatasetCite: boolean) => {
  return retainDatasetCite
    ? text.replace(/[\[【]id[\]】]\(CITE\)/g, '')
    : text
        .replace(/[\[【]([a-f0-9]{24})[\]】](?:\([^\)]*\)?)?/g, '')
        .replace(/[\[【]id[\]】]\(CITE\)/g, '');
};

// Parse llm stream part
export const parseLLMStreamResponse = () => {
  let isInThinkTag: boolean | undefined = undefined;
  let startTagBuffer = '';
  let endTagBuffer = '';

  const thinkStartChars = '<think>';
  const thinkEndChars = '</think>';

  let citeBuffer = '';
  const maxCiteBufferLength = 32; // [Object](CITE)总长度为32

  // Buffer
  let buffer_finishReason: CompletionFinishReason = null;
  let buffer_usage: CompletionUsage = getLLMDefaultUsage();
  let buffer_reasoningContent = '';
  let buffer_content = '';

  /* 
    parseThinkTag - 只控制是否主动解析 <think></think>，如果接口已经解析了，则不再解析。
    retainDatasetCite - 
  */
  const parsePart = ({
    part,
    parseThinkTag = true,
    retainDatasetCite = true
  }: {
    part: {
      choices: {
        delta: {
          content?: string | null;
          reasoning_content?: string;
        };
        finish_reason?: CompletionFinishReason;
      }[];
      usage?: CompletionUsage;
    };
    parseThinkTag?: boolean;
    retainDatasetCite?: boolean;
  }): {
    reasoningContent: string;
    content: string;
    responseContent: string;
    finishReason: CompletionFinishReason;
  } => {
    const data = (() => {
      buffer_usage = part.usage || buffer_usage;

      const finishReason = part.choices?.[0]?.finish_reason || null;
      buffer_finishReason = finishReason || buffer_finishReason;

      const content = part.choices?.[0]?.delta?.content || '';
      // @ts-ignore
      const reasoningContent = part.choices?.[0]?.delta?.reasoning_content || '';
      const isStreamEnd = !!buffer_finishReason;

      // Parse think
      const { reasoningContent: parsedThinkReasoningContent, content: parsedThinkContent } =
        (() => {
          if (reasoningContent || !parseThinkTag) {
            isInThinkTag = false;
            return { reasoningContent, content };
          }

          // 如果不在 think 标签中，或者有 reasoningContent(接口已解析），则返回 reasoningContent 和 content
          if (isInThinkTag === false) {
            return {
              reasoningContent: '',
              content
            };
          }

          // 检测是否为 think 标签开头的数据
          if (isInThinkTag === undefined) {
            // Parse content think and answer
            startTagBuffer += content;
            // 太少内容时候，暂时不解析
            if (startTagBuffer.length < thinkStartChars.length) {
              if (isStreamEnd) {
                const tmpContent = startTagBuffer;
                startTagBuffer = '';
                return {
                  reasoningContent: '',
                  content: tmpContent
                };
              }
              return {
                reasoningContent: '',
                content: ''
              };
            }

            if (startTagBuffer.startsWith(thinkStartChars)) {
              isInThinkTag = true;
              return {
                reasoningContent: startTagBuffer.slice(thinkStartChars.length),
                content: ''
              };
            }

            // 如果未命中 think 标签，则认为不在 think 标签中，返回 buffer 内容作为 content
            isInThinkTag = false;
            return {
              reasoningContent: '',
              content: startTagBuffer
            };
          }

          // 确认是 think 标签内容，开始返回 think 内容，并实时检测 </think>
          /* 
        检测 </think> 方案。
        存储所有疑似 </think> 的内容，直到检测到完整的 </think> 标签或超出 </think> 长度。
        content 返回值包含以下几种情况:
          abc - 完全未命中尾标签
          abc<th - 命中一部分尾标签
          abc</think> - 完全命中尾标签
          abc</think>abc - 完全命中尾标签
          </think>abc - 完全命中尾标签
          k>abc - 命中一部分尾标签
      */
          // endTagBuffer 专门用来记录疑似尾标签的内容
          if (endTagBuffer) {
            endTagBuffer += content;
            if (endTagBuffer.includes(thinkEndChars)) {
              isInThinkTag = false;
              const answer = endTagBuffer.slice(thinkEndChars.length);
              return {
                reasoningContent: '',
                content: answer
              };
            } else if (endTagBuffer.length >= thinkEndChars.length) {
              // 缓存内容超出尾标签长度，且仍未命中 </think>，则认为本次猜测 </think> 失败，仍处于 think 阶段。
              const tmp = endTagBuffer;
              endTagBuffer = '';
              return {
                reasoningContent: tmp,
                content: ''
              };
            }
            return {
              reasoningContent: '',
              content: ''
            };
          } else if (content.includes(thinkEndChars)) {
            // 返回内容，完整命中</think>，直接结束
            isInThinkTag = false;
            const [think, answer] = content.split(thinkEndChars);
            return {
              reasoningContent: think,
              content: answer
            };
          } else {
            // 无 buffer，且未命中 </think>，开始疑似 </think> 检测。
            for (let i = 1; i < thinkEndChars.length; i++) {
              const partialEndTag = thinkEndChars.slice(0, i);
              // 命中一部分尾标签
              if (content.endsWith(partialEndTag)) {
                const think = content.slice(0, -partialEndTag.length);
                endTagBuffer += partialEndTag;
                return {
                  reasoningContent: think,
                  content: ''
                };
              }
            }
          }

          // 完全未命中尾标签，还是 think 阶段。
          return {
            reasoningContent: content,
            content: ''
          };
        })();

      // Parse datset cite
      if (retainDatasetCite) {
        return {
          reasoningContent: parsedThinkReasoningContent,
          content: parsedThinkContent,
          responseContent: parsedThinkContent,
          finishReason: buffer_finishReason
        };
      }

      // 缓存包含 [ 的字符串，直到超出 maxCiteBufferLength 再一次性返回
      const parseCite = (text: string) => {
        // 结束时，返回所有剩余内容
        if (isStreamEnd) {
          const content = citeBuffer + text;
          return {
            content: removeDatasetCiteText(content, false)
          };
        }

        // 新内容包含 [，初始化缓冲数据
        if (text.includes('[') || text.includes('【')) {
          const index = text.indexOf('[') !== -1 ? text.indexOf('[') : text.indexOf('【');
          const beforeContent = citeBuffer + text.slice(0, index);
          citeBuffer = text.slice(index);

          // beforeContent 可能是：普通字符串，带 [ 的字符串
          return {
            content: removeDatasetCiteText(beforeContent, false)
          };
        }
        // 处于 Cite 缓冲区，判断是否满足条件
        else if (citeBuffer) {
          citeBuffer += text;

          // 检查缓冲区长度是否达到完整Quote长度或已经流结束
          if (citeBuffer.length >= maxCiteBufferLength) {
            const content = removeDatasetCiteText(citeBuffer, false);
            citeBuffer = '';

            return {
              content
            };
          } else {
            // 暂时不返回内容
            return { content: '' };
          }
        }

        return {
          content: text
        };
      };
      const { content: pasedCiteContent } = parseCite(parsedThinkContent);

      return {
        reasoningContent: parsedThinkReasoningContent,
        content: parsedThinkContent,
        responseContent: pasedCiteContent,
        finishReason: buffer_finishReason
      };
    })();

    buffer_reasoningContent += data.reasoningContent;
    buffer_content += data.content;

    return data;
  };

  const getResponseData = () => {
    return {
      finish_reason: buffer_finishReason,
      usage: buffer_usage,
      reasoningContent: buffer_reasoningContent,
      content: buffer_content
    };
  };

  const updateFinishReason = (finishReason: CompletionFinishReason) => {
    buffer_finishReason = finishReason;
  };

  return {
    parsePart,
    getResponseData,
    updateFinishReason
  };
};
