import { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  CompletionFinishReason,
  StreamChatType,
  UnStreamChatType,
  CompletionUsage
} from '@fastgpt/global/core/ai/type';
import { getLLMModel } from './model';
import { getLLMDefaultUsage } from '@fastgpt/global/core/ai/constants';

/* 
  Count response max token
*/
export const computedMaxToken = ({
  maxToken,
  model
}: {
  maxToken?: number;
  model: LLMModelItemType;
}) => {
  if (maxToken === undefined) return;

  maxToken = Math.min(maxToken, model.maxResponse);
  return maxToken;
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
    response_format?: any;
    json_schema?: string;
    stop?: string;
  },
  model: string | LLMModelItemType
): InferCompletionsBody<T> => {
  const modelData = typeof model === 'string' ? getLLMModel(model) : model;
  if (!modelData) {
    return body as unknown as InferCompletionsBody<T>;
  }

  const response_format = body.response_format;
  const json_schema = body.json_schema ?? undefined;
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
    response_format: response_format
      ? {
          type: response_format,
          json_schema
        }
      : undefined,
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
}> => {
  let answer = '';
  let usage = getLLMDefaultUsage();
  for await (const part of response) {
    usage = part.usage || usage;

    const content = part.choices?.[0]?.delta?.content || '';
    answer += content;
  }
  return {
    text: parseReasoningContent(answer)[1],
    usage
  };
};
export const llmUnStreamResponseToAnswerText = async (
  response: UnStreamChatType
): Promise<{
  text: string;
  usage?: CompletionUsage;
}> => {
  const answer = response.choices?.[0]?.message?.content || '';
  return {
    text: answer,
    usage: response.usage
  };
};
export const llmResponseToAnswerText = async (response: StreamChatType | UnStreamChatType) => {
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

export const parseQuoteContent = (text: string, parseQuote: boolean) => {
  return !parseQuote ? text.replace(/\[([a-f0-9]{24})\]\(QUOTE\)/g, '') : text;
};

// Parse <think></think> tags to think and answer - stream response
export const parseReasoningStreamContent = () => {
  // 初始化状态，相当于自动reset
  let isInThinkTag: boolean | undefined = undefined;
  let startTagBuffer = '';
  let endTagBuffer = '';

  const startTag = '<think>';
  const endTag = '</think>';

  // 添加Quote解析相关变量
  let isInQuoteTag: boolean | undefined = undefined;
  let quoteBuffer = '';
  const mongoIdLength = 24; // MongoDB ID长度
  const fullQuoteLength = 1 + mongoIdLength + 8; // [mongoId](QUOTE)总长度为33

  /* 
    parseThinkTag - 只控制是否主动解析 <think></think>，如果接口已经解析了，则不再解析。
    parseQuoteFlag - 控制是否保留 [mongoId](QUOTE) 格式的引用。为true时保留引用，为false时移除引用。
  */
  const parsePart = (
    part: {
      choices: {
        delta: {
          content?: string | null;
          reasoning_content?: string;
        };
        finish_reason?: CompletionFinishReason;
      }[];
    },
    parseThinkTag = false,
    parseQuoteFlag = false
  ): {
    reasoningContent: string;
    content: string;
    finishReason: CompletionFinishReason;
  } => {
    const content = part.choices?.[0]?.delta?.content || '';
    const finishReason = part.choices?.[0]?.finish_reason || null;

    // @ts-ignore
    const reasoningContent = part.choices?.[0]?.delta?.reasoning_content || '';

    // 检查是否是流结束信号
    const isStreamEnd = !!finishReason;

    // 先处理think标签
    let processedContent = '';
    let processedReasoningContent = '';

    if (reasoningContent || !parseThinkTag) {
      isInThinkTag = false;
      processedContent = content;
      processedReasoningContent = reasoningContent;
    } else if (!content) {
      processedContent = '';
      processedReasoningContent = '';
    } else if (isInThinkTag === false) {
      // 如果不在 think 标签中，或者有 reasoningContent(接口已解析），则返回 reasoningContent 和 content
      processedContent = content;
      processedReasoningContent = '';
    } else if (isInThinkTag === undefined) {
      // 检测是否为 think 标签开头的数据
      // Parse content think and answer
      startTagBuffer += content;
      // 太少内容时候，暂时不解析
      if (startTagBuffer.length < startTag.length) {
        processedContent = '';
        processedReasoningContent = '';
      } else if (startTagBuffer.startsWith(startTag)) {
        isInThinkTag = true;
        processedContent = '';
        processedReasoningContent = startTagBuffer.slice(startTag.length);
      } else {
        // 如果未命中 think 标签，则认为不在 think 标签中，返回 buffer 内容作为 content
        isInThinkTag = false;
        processedContent = startTagBuffer;
        processedReasoningContent = '';
      }
    } else if (endTagBuffer) {
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
      endTagBuffer += content;
      if (endTagBuffer.includes(endTag)) {
        isInThinkTag = false;
        processedContent = endTagBuffer.slice(endTag.length);
        processedReasoningContent = '';
      } else if (endTagBuffer.length >= endTag.length) {
        // 缓存内容超出尾标签长度，且仍未命中 </think>，则认为本次猜测 </think> 失败，仍处于 think 阶段。
        const tmp = endTagBuffer;
        endTagBuffer = '';
        processedContent = '';
        processedReasoningContent = tmp;
      } else {
        processedContent = '';
        processedReasoningContent = '';
      }
    } else if (content.includes(endTag)) {
      // 返回内容，完整命中</think>，直接结束
      isInThinkTag = false;
      const [think, answer] = content.split(endTag);
      processedContent = answer;
      processedReasoningContent = think;
    } else {
      // 无 buffer，且未命中 </think>，开始疑似 </think> 检测。
      let foundPartialEndTag = false;
      for (let i = 1; i < endTag.length; i++) {
        const partialEndTag = endTag.slice(0, i);
        // 命中一部分尾标签
        if (content.endsWith(partialEndTag)) {
          const think = content.slice(0, -partialEndTag.length);
          endTagBuffer += partialEndTag;
          processedContent = '';
          processedReasoningContent = think;
          foundPartialEndTag = true;
          break;
        }
      }

      if (!foundPartialEndTag) {
        // 完全未命中尾标签，还是 think 阶段。
        processedContent = '';
        processedReasoningContent = content;
      }
    }

    // 处理Quote引用格式
    if (!parseQuoteFlag && (processedContent || (isStreamEnd && isInQuoteTag))) {
      // 如果已在Quote缓冲区中
      if (isInQuoteTag === true) {
        if (processedContent) {
          quoteBuffer += processedContent;
        }

        // 检查缓冲区长度是否达到完整Quote长度或已经流结束
        if (quoteBuffer.length >= fullQuoteLength || isStreamEnd) {
          // 检查格式是否符合[mongoId](QUOTE)
          if (
            !isStreamEnd &&
            quoteBuffer.startsWith('[') &&
            quoteBuffer.substring(mongoIdLength + 1, mongoIdLength + 9) === '](QUOTE)'
          ) {
            // 符合格式，不返回内容
            isInQuoteTag = false;
            quoteBuffer = '';
            processedContent = '';
          } else {
            // 不符合格式或流结束，返回累积内容
            processedContent = quoteBuffer;
            isInQuoteTag = false;
            quoteBuffer = '';
          }
        } else {
          // 还未达到完整长度，继续缓冲
          processedContent = '';
        }
      }
      // 检测是否有Quote开始标记
      else if (processedContent && processedContent.includes('[')) {
        const parts = processedContent.split('[');
        const beforeTag = parts[0];
        const afterTag = parts.slice(1).join('[');

        isInQuoteTag = true;
        quoteBuffer = '[' + afterTag;

        // 如果缓冲区已达到完整长度或已经流结束
        if (quoteBuffer.length >= fullQuoteLength || isStreamEnd) {
          if (
            !isStreamEnd &&
            quoteBuffer.startsWith('[') &&
            quoteBuffer.substring(mongoIdLength + 1, mongoIdLength + 9) === '](QUOTE)'
          ) {
            // 符合格式，不返回内容
            isInQuoteTag = false;
            quoteBuffer = '';
            processedContent = beforeTag;
          } else {
            // 不符合格式或流结束，返回累积内容
            processedContent = beforeTag + quoteBuffer;
            isInQuoteTag = false;
            quoteBuffer = '';
          }
        } else {
          processedContent = beforeTag;
        }
      }
    }

    return {
      reasoningContent: processedReasoningContent,
      content: processedContent,
      finishReason
    };
  };

  const getStartTagBuffer = () => startTagBuffer;

  return {
    parsePart,
    getStartTagBuffer
  };
};
