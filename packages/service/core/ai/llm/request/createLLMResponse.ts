import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { getLogger, LogCategories } from '../../../../common/logger';
import { countGptMessagesTokens } from '../../../../common/string/tiktoken/index';
import { i18nT } from '@fastgpt/global/common/i18n/utils';
import { mergeAssistantFieldMessages } from '@fastgpt/global/core/chat/adapt';
import { promptToolCallMessageRewrite } from '../promptCall';
import { loadRequestMessages } from '../utils';
import { createLLMRequestId, sanitizeLLMRequestRecordPayload } from '../../record/controller';
import type { AIApiRequestMeta } from '../../config';
import { createChatCompletion } from './createChatCompletion';
import { useLLMResponseAccumulator } from './hooks/useLLMResponseAccumulator';
import { llmCompletionsBodyFormat } from './requestBody';
import {
  saveLLMErrorRecord as persistLLMErrorRecord,
  saveLLMResponseRecord as persistLLMResponseRecord
} from './records';
import { createCompleteResponse } from './response/complete';
import { normalizeCompletionFinishReason } from './response/normalize';
import { createStreamResponse } from './response/stream';
import type { CreateLLMResponseProps, LLMResponse } from './types';
import {
  checkOutputTextModeration,
  checkToolParamsModeration,
  createStreamModerationBuffer
} from '../../../plugin/moderation/output';
import { UserError } from '@fastgpt/global/common/error/utils';
import { MODERATION_BLOCKED_ERROR_MESSAGE } from '@fastgpt/global/core/plugin/moderation/constants';

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

  const {
    throwError = true,
    body,
    custonHeaders,
    timeout,
    userKey,
    maxContinuations = 1,
    saveLLMResponseRecord = true,
    teamId
  } = args;
  const { messages, useVision, useAudio, useVideo, extractFiles, tools, toolCallMode } = body;
  const model = body.model;

  // 先把 messages 中的文件/图片等 FastGPT 扩展结构加载成模型可直接消费的消息。
  const requestMessages = await loadRequestMessages({
    messages,
    useVision: useVision && model.config.vision,
    useAudio: useAudio && model.config.audio,
    useVideo: useVideo && model.config.video,
    extractFiles,
    fileContext: args.fileContext,
    supportReason: model.config.reasoning
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
  const accumulator = useLLMResponseAccumulator({ supportReason: model.config.reasoning });
  const initialRequestMessages = mergeAssistantFieldMessages(
    requestBody.messages as ChatCompletionMessageParam[]
  ) as ChatCompletionMessageParam[];
  let currentMessages: ChatCompletionMessageParam[] = [...initialRequestMessages];
  let continuationCount = 0;
  let aiRequestMeta: AIApiRequestMeta = {
    usedUserOpenAIKey: false
  };
  let hasSavedLLMRequestRecord = false;

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
          messages: currentMessages as typeof requestBody.messages
        },
        modelData,
        userKey,
        timeout,
        onRequestStart: args.onRequestStart,
        options: {
          headers: {
            Accept: 'application/json, text/plain, */*',
            ...custonHeaders
          },
          signal: args.signal,
          maxRetries: args.maxRetries
        }
      });
      aiRequestMeta = requestMeta;
      accumulator.setFirstResponseType(currentIsStreamResponse);
      const parsedResponse = await (async () => {
        if (currentIsStreamResponse) {
          let blockedReason = MODERATION_BLOCKED_ERROR_MESSAGE;

          const streamModerationBuffer = await createStreamModerationBuffer({
            context: { teamId, requestId },
            onApprovedText: (text) => args.onStreaming?.({ text }),
            onBlocked: (reason) => {
              blockedReason = reason || MODERATION_BLOCKED_ERROR_MESSAGE;
              response.controller?.abort();
            },
            abortController: response.controller
          });

          const isOutputModerationEnabled = streamModerationBuffer.enabled;

          const reasoningModerationBuffer =
            isOutputModerationEnabled && args.onReasoning
              ? await createStreamModerationBuffer({
                  context: { teamId, requestId },
                  onApprovedText: (text) => args.onReasoning?.({ text }),
                  onBlocked: (reason) => {
                    blockedReason = reason || MODERATION_BLOCKED_ERROR_MESSAGE;
                    response.controller?.abort();
                  },
                  abortController: response.controller
                })
              : undefined;

          const result = await createStreamResponse({
            response,
            requestMeta,
            body,
            isAborted: () =>
              args.isAborted?.() ||
              streamModerationBuffer.blocked ||
              Boolean(reasoningModerationBuffer?.blocked),
            onStreaming: async ({ text }) => {
              await streamModerationBuffer.push(text);
            },
            onReasoning: reasoningModerationBuffer
              ? async ({ text }) => {
                  await reasoningModerationBuffer.push(text);
                }
              : args.onReasoning,
            onToolCall: isOutputModerationEnabled ? undefined : args.onToolCall,
            onToolParam: isOutputModerationEnabled ? undefined : args.onToolParam
          });

          if (
            !result.error &&
            !streamModerationBuffer.blocked &&
            !reasoningModerationBuffer?.blocked
          ) {
            try {
              await Promise.all([
                streamModerationBuffer.flush(),
                reasoningModerationBuffer?.flush()
              ]);
            } catch (err) {
              result.answerText = '';
              result.reasoningText = '';
              result.error = err;
            }
          }

          if (streamModerationBuffer.blocked || reasoningModerationBuffer?.blocked) {
            result.answerText = '';
            result.reasoningText = '';
            result.error = new UserError(blockedReason);
          }

          return Object.assign(result, { isOutputModerationEnabled });
        }

        const completeResult = await createCompleteResponse({
          response,
          body
        });

        let isBlockedByModeration = false;

        // 锚点 3：非流式输出检查 - 违规整次拦截并记录错误，但不提前 throw 以便保留已发生的 token 用量
        if (completeResult.answerText) {
          const outputCheck = await checkOutputTextModeration({
            text: completeResult.answerText,
            targetField: 'answerText',
            context: { teamId, requestId }
          });
          if (!outputCheck.isPass) {
            isBlockedByModeration = true;
            const errMessage = outputCheck.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE;
            completeResult.answerText = '';
            completeResult.error = new UserError(errMessage);
          }
        }

        if (!isBlockedByModeration && completeResult.reasoningText) {
          const reasoningCheck = await checkOutputTextModeration({
            text: completeResult.reasoningText,
            targetField: 'reasoningText',
            context: { teamId, requestId }
          });
          if (!reasoningCheck.isPass) {
            isBlockedByModeration = true;
            const errMessage = reasoningCheck.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE;
            completeResult.reasoningText = '';
            completeResult.answerText = '';
            completeResult.error = new UserError(errMessage);
          }
        }

        return Object.assign(completeResult, { isBlockedByModeration });
      })();

      let isToolBlockedByModeration = false;
      // 锚点 3：模型生成的工具参数检查 - 违规终止调用并清空参数，但不提前 throw 以便保留已发生的 token 用量
      if (parsedResponse.toolCalls?.length) {
        const toolCheck = await checkToolParamsModeration({
          toolCalls: parsedResponse.toolCalls,
          context: { teamId, requestId }
        });
        if (!toolCheck.isPass) {
          isToolBlockedByModeration = true;
          const errMessage = toolCheck.blockErrorMessage || MODERATION_BLOCKED_ERROR_MESSAGE;
          parsedResponse.toolCalls = [];
          parsedResponse.error = new UserError(errMessage);
        }
      }

      // 审核全部通过后派发回调（未被审核拦截的内容正常对外派发）
      const isBlockedByModeration = (parsedResponse as any).isBlockedByModeration;
      if (!currentIsStreamResponse) {
        if (!isBlockedByModeration) {
          if (parsedResponse.reasoningText) {
            args.onReasoning?.({ text: parsedResponse.reasoningText });
          }
          if (parsedResponse.answerText) {
            args.onStreaming?.({ text: parsedResponse.answerText });
          }
        }
        if (!isToolBlockedByModeration && parsedResponse.toolCalls?.length) {
          parsedResponse.toolCalls.forEach((call) => {
            args.onToolCall?.({ call });
          });
        }
      } else if (
        (parsedResponse as any).isOutputModerationEnabled &&
        !isToolBlockedByModeration &&
        parsedResponse.toolCalls?.length
      ) {
        parsedResponse.toolCalls.forEach((call) => {
          args.onToolCall?.({ call });
        });
      }

      accumulator.appendResponse(parsedResponse);

      if (accumulator.shouldContinue()) {
        // 继续输出时，用原始 requestBody.messages 做基础，避免把 rewrite 前 messages 混回上下文。
        currentMessages = mergeAssistantFieldMessages(
          accumulator.buildContinuationMessages({
            baseMessages: requestBody.messages as ChatCompletionMessageParam[]
          })
        ) as ChatCompletionMessageParam[];

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
      assistantMessage,
      answerText,
      reasoningText,
      toolCalls,
      finish_reason: rawFinishReason,
      usage,
      error: responseError,
      isStreamResponse
    } = accumulator.getResponse();
    let error = responseError;
    // 底层供应商有时会漏 finish_reason。stream 有内容但没结束标记时记录 abnormal_close，非 stream 补 stop。
    const finish_reason = normalizeCompletionFinishReason({
      rawFinishReason,
      isStreamResponse,
      hasResponse: !!answerText || !!reasoningText || !!toolCalls?.length,
      error
    });

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
      const requestSnapshot = sanitizeLLMRequestRecordPayload(requestBody);
      if (aiRequestMeta.usedUserOpenAIKey) {
        logger.warn(`User LLM response empty`, {
          baseUrl: aiRequestMeta.baseUrl,
          requestBody: requestSnapshot,
          finish_reason
        });
        // 详细请求写入清洗后的日志，用户提示保持固定文案。
        return `您的 OpenAI key 没有响应`;
      } else {
        logger.error(`LLM response empty`, {
          data: requestSnapshot,
          finish_reason
        });
      }

      return i18nT('chat:LLM_model_response_empty');
    };
    // 空工具和空响应均依据多轮累计结果，避免忽略此前已生成的内容。
    const isEmptyToolCallsFinish = !error && rawFinishReason === 'tool_calls' && !toolCalls?.length;
    const isNotResponse =
      !answerText &&
      !reasoningText &&
      !toolCalls?.length &&
      !error &&
      (finish_reason === 'stop' || !finish_reason);
    const responseEmptyTip = isNotResponse ? getEmptyResponseTip() : undefined;

    if (saveLLMResponseRecord && teamId) {
      // 先保存模型结果，再生成系统兜底错误，避免覆盖 Mongo 原始输出与结束原因。
      persistLLMResponseRecord({
        teamId,
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
      hasSavedLLMRequestRecord = true;
    }

    if (isEmptyToolCallsFinish) {
      // 接口错误优先；累计没有有效工具时补充错误，保留模型结束原因。
      error = new Error('LLM tool call error: no valid tool calls matched the requested tools.');
      logger.error('LLM tool calls missing', {
        requestBody: sanitizeLLMRequestRecordPayload(requestBody),
        message: error.message
      });
    }

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
      rawUsage: usage,
      requestId,

      requestMessages: initialRequestMessages,
      assistantMessage,
      completeMessages: [...initialRequestMessages, assistantMessage]
    };
  } catch (error) {
    // createChatCompletion 抛错或解析阶段抛错都会落到这里，保证 requestId 对应的错误详情被保存。
    // 如果已拿到模型响应并保存过包含 error 的详情，throwError 再抛出时不重复写同一个 requestId。
    if (saveLLMResponseRecord && teamId && !hasSavedLLMRequestRecord) {
      persistLLMErrorRecord({
        teamId,
        requestId,
        requestBody: requestBody as ChatCompletionCreateParams,
        error
      });
    }

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
      requestMessages: initialRequestMessages,
      completeMessages: [...initialRequestMessages]
    };
  }
};
