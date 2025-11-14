import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionCreateParamsStreaming,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason,
  CompletionUsage,
  OpenAI,
  StreamChatType,
  UnStreamChatType
} from '@fastgpt/global/core/ai/type';
import { computedTemperature, parseLLMStreamResponse, parseReasoningContent } from '../utils';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { getAIApi } from '../config';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { parsePromptToolCall, promptToolCallMessageRewrite } from './promptCall';
import { getLLMModel } from '../model';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { countGptMessagesTokens } from '../../../common/string/tiktoken/index';
import { loadRequestMessages } from './utils';
import { addLog } from '../../../common/system/log';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.d';
import { i18nT } from '../../../../web/i18n/utils';
import { getErrText } from '@fastgpt/global/common/error/utils';
import json5 from 'json5';

export type ResponseEvents = {
  onStreaming?: ({ text }: { text: string }) => void;
  onReasoning?: ({ text }: { text: string }) => void;
  onToolCall?: ({ call }: { call: ChatCompletionMessageToolCall }) => void;
  onToolParam?: ({ tool, params }: { tool: ChatCompletionMessageToolCall; params: string }) => void;
};

export type CreateLLMResponseProps<T extends CompletionsBodyType = CompletionsBodyType> = {
  userKey?: OpenaiAccountType;
  body: LLMRequestBodyType<T>;
  isAborted?: () => boolean | undefined;
  custonHeaders?: Record<string, string>;
} & ResponseEvents;

type LLMResponse = {
  isStreamResponse: boolean;
  answerText: string;
  reasoningText: string;
  toolCalls?: ChatCompletionMessageToolCall[];
  finish_reason: CompletionFinishReason;
  getEmptyResponseTip: () => string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };

  requestMessages: ChatCompletionMessageParam[];
  assistantMessage: ChatCompletionMessageParam[];
  completeMessages: ChatCompletionMessageParam[];
};

/*
  底层封装 LLM 调用 帮助上层屏蔽 stream 和非 stream，以及 toolChoice 和 promptTool 模式。
  工具调用无论哪种模式，都存 toolChoice 的格式，promptTool 通过修改 toolChoice 的结构，形成特定的 messages 进行调用。
*/
export const createLLMResponse = async <T extends CompletionsBodyType>(
  args: CreateLLMResponseProps<T>
): Promise<LLMResponse> => {
  const { body, custonHeaders, userKey } = args;
  const { messages, useVision, requestOrigin, tools, toolCallMode } = body;

  // Messages process
  const requestMessages = await loadRequestMessages({
    messages,
    useVision,
    origin: requestOrigin
  });
  // Message process
  const rewriteMessages = (() => {
    if (tools?.length && toolCallMode === 'prompt') {
      return promptToolCallMessageRewrite(requestMessages, tools);
    }
    return requestMessages;
  })();

  const requestBody = await llmCompletionsBodyFormat({
    ...body,
    messages: rewriteMessages
  });

  // console.dir(requestBody, { depth: null });
  const { response, isStreamResponse, getEmptyResponseTip } = await createChatCompletion({
    body: requestBody,
    userKey,
    options: {
      headers: {
        Accept: 'application/json, text/plain, */*',
        ...custonHeaders
      }
    }
  });

  const { answerText, reasoningText, toolCalls, finish_reason, usage } = await (async () => {
    if (isStreamResponse) {
      return createStreamResponse({
        response,
        body,
        isAborted: args.isAborted,
        onStreaming: args.onStreaming,
        onReasoning: args.onReasoning,
        onToolCall: args.onToolCall,
        onToolParam: args.onToolParam
      });
    } else {
      return createCompleteResponse({
        response,
        body,
        onStreaming: args.onStreaming,
        onReasoning: args.onReasoning,
        onToolCall: args.onToolCall
      });
    }
  })();

  const assistantMessage: ChatCompletionMessageParam[] = [
    ...(answerText || reasoningText
      ? [
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant as 'assistant',
            content: answerText,
            reasoning_text: reasoningText
          }
        ]
      : []),
    ...(toolCalls?.length
      ? [
          {
            role: ChatCompletionRequestMessageRoleEnum.Assistant as 'assistant',
            tool_calls: toolCalls
          }
        ]
      : [])
  ];

  // Usage count
  const inputTokens =
    usage?.prompt_tokens || (await countGptMessagesTokens(requestBody.messages, requestBody.tools));
  const outputTokens = usage?.completion_tokens || (await countGptMessagesTokens(assistantMessage));

  return {
    isStreamResponse,
    getEmptyResponseTip,
    answerText,
    reasoningText,
    toolCalls,
    finish_reason,
    usage: {
      inputTokens,
      outputTokens
    },

    requestMessages,
    assistantMessage,
    completeMessages: [...requestMessages, ...assistantMessage]
  };
};

type CompleteParams = Pick<CreateLLMResponseProps<CompletionsBodyType>, 'body'> & ResponseEvents;

type CompleteResponse = Pick<
  LLMResponse,
  'answerText' | 'reasoningText' | 'toolCalls' | 'finish_reason'
> & {
  usage?: CompletionUsage;
};

export const createStreamResponse = async ({
  body,
  response,
  isAborted,
  onStreaming,
  onReasoning,
  onToolCall,
  onToolParam
}: CompleteParams & {
  response: StreamChatType;
  isAborted?: () => boolean | undefined;
}): Promise<CompleteResponse> => {
  const { retainDatasetCite = true, tools, toolCallMode = 'toolChoice', model } = body;
  const modelData = getLLMModel(model);

  const { parsePart, getResponseData, updateFinishReason } = parseLLMStreamResponse();

  if (tools?.length) {
    if (toolCallMode === 'toolChoice') {
      let callingTool: ChatCompletionMessageToolCall['function'] | null = null;
      const toolCalls: ChatCompletionMessageToolCall[] = [];

      for await (const part of response) {
        if (isAborted?.()) {
          response.controller?.abort();
          updateFinishReason('close');
          break;
        }

        const { reasoningContent, responseContent } = parsePart({
          part,
          parseThinkTag: modelData.reasoning,
          retainDatasetCite
        });

        if (reasoningContent) {
          onReasoning?.({ text: reasoningContent });
        }
        if (responseContent) {
          onStreaming?.({ text: responseContent });
        }

        const responseChoice = part.choices?.[0]?.delta;

        // Parse tool calls
        if (responseChoice?.tool_calls?.length) {
          responseChoice.tool_calls.forEach((toolCall, i) => {
            const index = toolCall.index ?? i;

            // Call new tool
            const hasNewTool = toolCall?.function?.name || callingTool;
            if (hasNewTool) {
              // Call new tool
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

              // New tool, add to list.
              if (tools.find((item) => item.function.name === callingTool!.name)) {
                const call: ChatCompletionMessageToolCall = {
                  id: getNanoid(),
                  type: 'function',
                  function: callingTool!
                };
                toolCalls[index] = call;
                onToolCall?.({ call });
                callingTool = null;
              }
            } else {
              /* arg 追加到当前工具的参数里 */
              const arg: string = toolCall?.function?.arguments ?? '';
              const currentTool = toolCalls[index];
              if (currentTool && arg) {
                currentTool.function.arguments += arg;

                onToolParam?.({ tool: currentTool, params: arg });
              }
            }
          });
        }
      }

      const { reasoningContent, content, finish_reason, usage } = getResponseData();

      return {
        answerText: content,
        reasoningText: reasoningContent,
        finish_reason,
        usage,
        toolCalls: toolCalls.filter((call) => !!call)
      };
    } else {
      let startResponseWrite = false;
      let answer = '';

      for await (const part of response) {
        if (isAborted?.()) {
          response.controller?.abort();
          updateFinishReason('close');
          break;
        }

        const { reasoningContent, content, responseContent } = parsePart({
          part,
          parseThinkTag: modelData.reasoning,
          retainDatasetCite
        });
        answer += content;

        if (reasoningContent) {
          onReasoning?.({ text: reasoningContent });
        }

        if (content) {
          if (startResponseWrite) {
            if (responseContent) {
              onStreaming?.({ text: responseContent });
            }
          } else if (answer.length >= 3) {
            answer = answer.trimStart();

            // Not call tool
            if (/0(:|：)/.test(answer)) {
              startResponseWrite = true;

              // find first : index
              const firstIndex =
                answer.indexOf('0:') !== -1 ? answer.indexOf('0:') : answer.indexOf('0：');
              answer = answer.substring(firstIndex + 2).trim();

              onStreaming?.({ text: answer });
            }
            // Not response tool
            else if (/1(:|：)/.test(answer)) {
            }
            // Not start 1/0, start response
            else {
              startResponseWrite = true;
              onStreaming?.({ text: answer });
            }
          }
        }
      }

      const { reasoningContent, content, finish_reason, usage } = getResponseData();
      const { answer: llmAnswer, streamAnswer, toolCalls } = parsePromptToolCall(content);

      if (streamAnswer) {
        onStreaming?.({ text: streamAnswer });
      }

      toolCalls?.forEach((call) => {
        onToolCall?.({ call });
      });

      return {
        answerText: llmAnswer,
        reasoningText: reasoningContent,
        finish_reason,
        usage,
        toolCalls
      };
    }
  } else {
    // Not use tool
    for await (const part of response) {
      if (isAborted?.()) {
        response.controller?.abort();
        updateFinishReason('close');
        break;
      }

      const { reasoningContent, responseContent } = parsePart({
        part,
        parseThinkTag: modelData.reasoning,
        retainDatasetCite
      });

      if (reasoningContent) {
        onReasoning?.({ text: reasoningContent });
      }
      if (responseContent) {
        onStreaming?.({ text: responseContent });
      }
    }

    const { reasoningContent, content, finish_reason, usage } = getResponseData();

    return {
      answerText: content,
      reasoningText: reasoningContent,
      finish_reason,
      usage
    };
  }
};

export const createCompleteResponse = async ({
  body,
  response,
  onStreaming,
  onReasoning,
  onToolCall
}: CompleteParams & { response: ChatCompletion }): Promise<CompleteResponse> => {
  const { tools, toolCallMode = 'toolChoice', retainDatasetCite = true } = body;
  const modelData = getLLMModel(body.model);

  const finish_reason = response.choices?.[0]?.finish_reason as CompletionFinishReason;
  const usage = response.usage;

  // Content and think parse
  const { content, reasoningContent } = (() => {
    const content = response.choices?.[0]?.message?.content || '';
    const reasoningContent: string =
      (response.choices?.[0]?.message as any)?.reasoning_content || '';

    // API already parse reasoning content
    if (reasoningContent || !modelData.reasoning) {
      return {
        content,
        reasoningContent
      };
    }

    const [think, answer] = parseReasoningContent(content);
    return {
      content: answer,
      reasoningContent: think
    };
  })();
  const formatReasonContent = removeDatasetCiteText(reasoningContent, retainDatasetCite);
  let formatContent = removeDatasetCiteText(content, retainDatasetCite);

  // Tool parse
  const { toolCalls } = (() => {
    if (tools?.length) {
      if (toolCallMode === 'toolChoice') {
        return {
          toolCalls: response.choices?.[0]?.message?.tool_calls || []
        };
      }

      // Prompt call
      const { answer, toolCalls } = parsePromptToolCall(formatContent);
      formatContent = answer;

      return {
        toolCalls
      };
    }

    return {
      toolCalls: undefined
    };
  })();

  // Event response
  if (formatReasonContent) {
    onReasoning?.({ text: formatReasonContent });
  }
  if (formatContent) {
    onStreaming?.({ text: formatContent });
  }
  if (toolCalls?.length && onToolCall) {
    toolCalls.forEach((call) => {
      onToolCall({ call });
    });
  }

  return {
    reasoningText: formatReasonContent,
    answerText: formatContent,
    toolCalls,
    finish_reason,
    usage
  };
};

type CompletionsBodyType =
  | ChatCompletionCreateParamsNonStreaming
  | ChatCompletionCreateParamsStreaming;
type InferCompletionsBody<T> = T extends { stream: true }
  ? ChatCompletionCreateParamsStreaming
  : T extends { stream: false }
    ? ChatCompletionCreateParamsNonStreaming
    : ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;

type LLMRequestBodyType<T> = Omit<T, 'model' | 'stop' | 'response_format' | 'messages'> & {
  model: string | LLMModelItemType;
  stop?: string;
  response_format?: {
    type?: string;
    json_schema?: string;
  };
  messages: ChatCompletionMessageParam[];

  // Custom field
  retainDatasetCite?: boolean;
  toolCallMode?: 'toolChoice' | 'prompt';
  useVision?: boolean;
  requestOrigin?: string;
};
const llmCompletionsBodyFormat = async <T extends CompletionsBodyType>({
  retainDatasetCite,
  useVision,
  requestOrigin,

  tools,
  tool_choice,
  parallel_tool_calls,
  toolCallMode,
  ...body
}: LLMRequestBodyType<T>): Promise<InferCompletionsBody<T>> => {
  const modelData = getLLMModel(body.model);
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

  const requestBody = {
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
    stop: stop?.split('|'),
    ...(toolCallMode === 'toolChoice' && {
      tools,
      tool_choice,
      parallel_tool_calls
    })
  } as T;

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
const createChatCompletion = async ({
  modelData,
  body,
  userKey,
  timeout,
  options
}: {
  modelData?: LLMModelItemType;
  body: ChatCompletionCreateParamsNonStreaming | ChatCompletionCreateParamsStreaming;
  userKey?: OpenaiAccountType;
  timeout?: number;
  options?: OpenAI.RequestOptions;
}): Promise<
  {
    getEmptyResponseTip: () => string;
  } & (
    | {
        response: StreamChatType;
        isStreamResponse: true;
      }
    | {
        response: UnStreamChatType;
        isStreamResponse: false;
      }
  )
> => {
  try {
    // Rewrite model
    const modelConstantsData = modelData || getLLMModel(body.model);
    if (!modelConstantsData) {
      return Promise.reject(`${body.model} not found`);
    }
    body.model = modelConstantsData.model;

    const formatTimeout = timeout ? timeout : 600000;
    const ai = getAIApi({
      userKey,
      timeout: formatTimeout
    });

    addLog.debug(`Start create chat completion`, {
      model: body.model
    });

    const response = await ai.chat.completions.create(body, {
      ...options,
      ...(modelConstantsData.requestUrl ? { path: modelConstantsData.requestUrl } : {}),
      headers: {
        ...options?.headers,
        ...(modelConstantsData.requestAuth
          ? { Authorization: `Bearer ${modelConstantsData.requestAuth}` }
          : {})
      }
    });

    const isStreamResponse =
      typeof response === 'object' &&
      response !== null &&
      ('iterator' in response || 'controller' in response);

    const getEmptyResponseTip = () => {
      addLog.warn(`LLM response empty`, {
        baseUrl: userKey?.baseUrl,
        requestBody: body
      });
      if (userKey?.baseUrl) {
        return `您的 OpenAI key 没有响应: ${JSON.stringify(body)}`;
      }
      return i18nT('chat:LLM_model_response_empty');
    };

    if (isStreamResponse) {
      return {
        response,
        isStreamResponse: true,
        getEmptyResponseTip
      };
    }

    return {
      response,
      isStreamResponse: false,
      getEmptyResponseTip
    };
  } catch (error) {
    addLog.error(`LLM response error`, error);
    addLog.warn(`LLM response error`, {
      baseUrl: userKey?.baseUrl,
      requestBody: body
    });
    if (userKey?.baseUrl) {
      return Promise.reject(`您的 OpenAI key 出错了: ${getErrText(error)}`);
    }
    return Promise.reject(error);
  }
};
