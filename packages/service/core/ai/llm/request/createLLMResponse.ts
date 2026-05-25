import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getLogger, LogCategories } from '../../../../common/logger';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { getLLMModel } from '../../model';
import { promptToolCallMessageRewrite } from '../promptCall';
import { loadRequestMessages } from '../utils';
import { createLLMRequestId } from '../../record/controller';
import type { AIApiRequestMeta } from '../../config';
import { createChatCompletion } from './createChatCompletion';
import { useLLMResponseAccumulator } from './hooks/useLLMResponseAccumulator';
import { llmCompletionsBodyFormat } from './requestBody';
import { saveLLMErrorRecord, saveLLMResponseRecord } from './records';
import { createCompleteResponse } from './response/complete';
import { normalizeCompletionFinishReason } from './response/normalize';
import { createStreamResponse } from './response/stream';
import type { CreateLLMResponseProps, LLMResponse } from './types';

const logger = getLogger(LogCategories.MODULE.AI.LLM);

/**
 * 底层 LLM 请求入口，负责把 FastGPT 内部 body 转成模型请求、执行请求、解析响应并保存请求详情。
 *
 * 这里刻意屏蔽了上层不需要关心的差异：
 * 1. stream 与非 stream 最终都会返回统一的 LLMResponse。
 * 2. toolChoice 与 prompt tool 最终都会归一成 OpenAI tool_calls 格式。
 * 3. finish_reason 缺失时会在这里补齐，避免上层节点拿到不完整状态。
 */
export const createLLMResponse = async <T extends ChatCompletionCreateParams>(
  args: CreateLLMResponseProps<T>
): Promise<LLMResponse> => {
  const requestId = createLLMRequestId();

  const { throwError = true, body, custonHeaders, userKey, maxContinuations = 1 } = args;
  const { messages, useVision, useAudio, useVideo, extractFiles, tools, toolCallMode } = body;
  const model = getLLMModel(body.model);

  // 先把 messages 中的文件/图片等 FastGPT 扩展结构加载成模型可直接消费的消息。
  const requestMessages = await loadRequestMessages({
    messages,
    useVision: useVision && model.vision,
    useAudio: useAudio && model.audio,
    useVideo: useVideo && model.video,
    extractFiles,
    supportReason: model.reasoning
  });
  const rewriteMessages = (() => {
    if (tools?.length && toolCallMode === 'prompt') {
      // prompt tool 模式不把 tools 直接传给模型，而是把工具协议写进 prompt。
      return promptToolCallMessageRewrite(requestMessages, tools);
    }
    return requestMessages;
  })();
  // 统一处理模型别名、默认配置、支持参数裁剪和字段映射。
  const { requestBody, modelData } = await llmCompletionsBodyFormat({
    ...body,
    messages: rewriteMessages
  });
  const accumulator = useLLMResponseAccumulator();
  let currentMessages = [...requestBody.messages];
  let continuationCount = 0;
  let aiRequestMeta: AIApiRequestMeta = {
    usedUserOpenAIKey: false
  };

  try {
    // 自带“继续”的循环：finish_reason=length 时追加已生成内容后继续请求。
    while (continuationCount < maxContinuations) {
      const {
        response,
        isStreamResponse: currentIsStreamResponse,
        requestMeta
      } = await createChatCompletion({
        body: {
          ...requestBody,
          messages: currentMessages
        },
        modelData,
        userKey,
        options: {
          headers: {
            Accept: 'application/json, text/plain, */*',
            ...custonHeaders
          }
        }
      });
      aiRequestMeta = requestMeta;
      // 连续输出补偿请求可能多次进入循环，但本次调用对外只认第一次响应形态。
      accumulator.setFirstResponseType(currentIsStreamResponse);

      const parsedResponse = await (async () => {
        if (currentIsStreamResponse) {
          return createStreamResponse({
            response,
            body,
            isAborted: args.isAborted,
            onStreaming: args.onStreaming,
            onReasoning: args.onReasoning,
            onToolCall: args.onToolCall,
            onToolParam: args.onToolParam
          });
        }

        return createCompleteResponse({
          response,
          body,
          onStreaming: args.onStreaming,
          onReasoning: args.onReasoning,
          onToolCall: args.onToolCall
        });
      })();

      accumulator.appendResponse(parsedResponse);

      if (accumulator.shouldContinue()) {
        // 继续输出时，用原始 requestBody.messages 做基础，避免把 rewrite 前 messages 混回上下文。
        currentMessages = accumulator.buildContinuationMessages({
          baseMessages: requestBody.messages as ChatCompletionMessageParam[]
        }) as typeof currentMessages;

        logger.debug(`Continue LLM response due to length limit`, {
          continuationCount,
          completionTokens: parsedResponse.usage?.completion_tokens
        });
        continuationCount++;
      } else {
        break;
      }
    }

    const {
      answerText,
      reasoningText,
      toolCalls,
      finish_reason: rawFinishReason,
      usage,
      error,
      isStreamResponse
    } = accumulator.getResponse();
    // 底层供应商有时会漏 finish_reason。stream 有内容但没结束标记时记录 abnormal_close，非 stream 补 stop。
    const finish_reason = normalizeCompletionFinishReason({
      rawFinishReason,
      isStreamResponse,
      hasResponse: !!answerText || !!reasoningText || !!toolCalls?.length,
      error
    });

    const assistantMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Assistant as 'assistant',
      ...(answerText && { content: answerText }),
      ...(reasoningText && { reasoning_content: reasoningText }),
      ...(toolCalls?.length && { tool_calls: toolCalls })
    };

    // requestBody 运行时是经 LLMRequestBodyType narrow 进来的 FastGPT 数据，
    // 但类型层 InferCompletionsBody 落到了 SDK 形态（messages/tools 是 v6 后的 union）
    const inputTokens =
      usage?.prompt_tokens ||
      (await countGptMessagesTokens({
        messages: requestBody.messages as ChatCompletionMessageParam[],
        tools: requestBody.tools as ChatCompletionTool[] | undefined
      }));
    const outputTokens =
      usage?.completion_tokens ||
      (await countGptMessagesTokens({
        messages: [assistantMessage]
      }));

    /**
     * 空响应不一定是请求异常，可能是模型返回 stop 但没有内容。
     * 用户自定义 key 场景需要给出更明确的排查信息，系统 key 场景保持 i18n 文案。
     */
    const getEmptyResponseTip = () => {
      if (aiRequestMeta.usedUserOpenAIKey) {
        logger.warn(`User LLM response empty`, {
          baseUrl: aiRequestMeta.baseUrl,
          requestBody,
          finish_reason
        });
        return `您的 OpenAI key 没有响应: ${JSON.stringify(body)}`;
      }

      logger.error(`LLM response empty`, {
        message: '',
        data: requestBody,
        finish_reason
      });
      return i18nT('chat:LLM_model_response_empty');
    };
    const isEmptyToolCallsFinish = finish_reason === 'tool_calls' && !toolCalls?.length;
    const isNotResponse =
      !answerText &&
      !toolCalls?.length &&
      !error &&
      (finish_reason === 'stop' || !finish_reason || isEmptyToolCallsFinish);
    const responseEmptyTip = isNotResponse ? getEmptyResponseTip() : undefined;

    // 保存详情只记录实际请求与模型响应，不把用于计费分支的 usedUserOpenAIKey 写入详情。
    saveLLMResponseRecord({
      requestId,
      requestBody: requestBody as ChatCompletionCreateParams,
      answerText,
      reasoningText,
      toolCalls,
      finishReason: finish_reason,
      usage,
      inputTokens,
      outputTokens,
      error: error ?? responseEmptyTip
    });

    if (error && throwError) {
      throw error;
    }

    return {
      error,
      isStreamResponse,
      responseEmptyTip,
      answerText,
      reasoningText,
      toolCalls,
      finish_reason,
      usage: {
        inputTokens,
        outputTokens,
        usedUserOpenAIKey: aiRequestMeta.usedUserOpenAIKey
      },
      requestId,

      requestMessages,
      assistantMessage,
      completeMessages: [...requestMessages, assistantMessage]
    };
  } catch (error) {
    // createChatCompletion 抛错或解析阶段抛错都会落到这里，保证 requestId 对应的错误详情被保存。
    saveLLMErrorRecord({
      requestId,
      requestBody: requestBody as ChatCompletionCreateParams,
      error
    });

    if (throwError) {
      throw error;
    }

    return {
      error,
      requestId,
      isStreamResponse: false,
      answerText: '',
      reasoningText: '',
      finish_reason: 'error',
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        usedUserOpenAIKey: false
      },
      requestMessages: requestBody.messages as ChatCompletionMessageParam[],
      completeMessages: [...requestBody.messages] as ChatCompletionMessageParam[]
    };
  }
};
