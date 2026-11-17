import { Agent, type AgentEvent } from '@mariozechner/pi-agent-core';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { isTeamModel } from '@fastgpt/global/core/ai/model/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import type { AgentAskPayload } from '@fastgpt/global/core/ai/agent/type';
import { getErrText, UserError } from '@fastgpt/global/common/error/utils';
import {
  isModerationBlockErrorMessage,
  MODERATION_BLOCKED_ERROR_MESSAGE,
  MODERATION_BLOCKED_REPLACE_TEXT
} from '@fastgpt/global/core/plugin/moderation/constants';
import {
  checkToolResultModeration,
  isToolResultModerated,
  markToolResultModerated,
  sanitizeModeratedToolNodeResponse
} from '../../../../../plugin/moderation/modelInput';
import {
  createStreamModerationBuffer,
  checkToolParamsModeration
} from '../../../../../plugin/moderation/output';
import {
  normalizeToolResponseContent,
  removeDatasetCiteText
} from '@fastgpt/global/core/ai/llm/utils';
import { loadRequestMessages } from '../../../utils';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { AgentUsageModuleName } from '../../domain/usage';
import { askUserToolName, formatAgentAskToolResponse } from '../../domain/systemTool/ask';
import { setPlanToolName, updatePlanToolName } from '../../domain/systemTool/plan';
import {
  normalizeAgentLoopUsages,
  type AgentLoopInput,
  type AgentLoopResult,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../../domain';
import { buildPiModel, getModelApiKey, getPiThinkingLevel } from './modelBridge';
import { getLegacyModelEndpoint } from '../../../../legacy/requestUrl';
import {
  installSafeLegacyFetchShim,
  runWithSafeLegacyFetch
} from '../../../../../../common/api/safeFetch';
import { mergePiAgentPayload } from './payload';
import { buildPiAgentTools } from './tool/build';
import { getPiAgentNormalizationTools } from './tool/catalog';
import type { PiAgentProviderState } from './type';
import { compressRequestMessages } from '../../../compress';
import {
  convertChatMessagesToPiAgentMessages,
  convertPiAgentMessagesToChatMessages,
  getPiAgentPrompt,
  isAssistantMessage,
  mapStopReason,
  normalizePiAgentMessages,
  readAssistantMessage,
  replaceInteractiveToolResult,
  resolveInteractiveToolCall,
  stringifyJson
} from './message';

const readPiAgentProviderState = (providerState: unknown): PiAgentProviderState => {
  if (!providerState || typeof providerState !== 'object') return {};
  return providerState as PiAgentProviderState;
};

const pushAgentLoopUsages = <TChildrenResponse = unknown>(
  runtime: AgentLoopRuntime<TChildrenResponse>,
  usages?: Array<AgentLoopUsage | undefined>
) => {
  const normalizedUsages = normalizeAgentLoopUsages(usages);
  if (normalizedUsages.length > 0) runtime.usagePush?.(normalizedUsages);
};

export const runPiAgentLoop = async <TChildrenResponse = unknown>({
  input,
  runtime
}: {
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
}): Promise<AgentLoopResult<TChildrenResponse>> => {
  const state = readPiAgentProviderState(input.providerState);
  const modelData = runtime.llmParams.model;
  const piModel = buildPiModel(
    modelData,
    runtime.llmParams.useVision,
    runtime.llmParams.userKey,
    runtime.llmParams.maxTokens
  );
  const requestMessages = await loadRequestMessages({
    messages: input.messages,
    useVision: runtime.llmParams.useVision && modelData.config.vision,
    useAudio: runtime.llmParams.useAudio && modelData.config.audio,
    useVideo: runtime.llmParams.useVideo && modelData.config.video,
    extractFiles: runtime.llmParams.extractFiles,
    fileContext: runtime.fileContext,
    supportReason: modelData.config.reasoning
  });
  const requestIds: string[] = [];
  let requestIndex = 0;
  let answerText = '';
  // 完成检查需要最近一次自然结束的正文，answerText 只保留首个回复用于汇总兼容。
  let latestAnswerText = '';
  let reasoningText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let llmTotalPoints = 0;
  let finishReason: CompletionFinishReason = 'stop';
  const pendingMainContext = state.pendingMainContext;
  let activePlan = input.activePlan ?? pendingMainContext?.activePlan ?? state.activePlan;
  let pendingAsk: AgentAskPayload | undefined;
  let pendingAskId: string | undefined;
  let pendingToolChild:
    | {
        childrenResponse: TChildrenResponse;
        toolCallId: string;
      }
    | undefined;
  let pendingToolStop = false;
  let latestError: unknown;
  let latestContextCheckpoint: string | undefined;
  let reachedRunLimit = false;
  const assistantMessages: ChatCompletionMessageParam[] = [];
  const controlToolNames = new Set([askUserToolName, setPlanToolName, updatePlanToolName]);
  const emittedToolCallIds = new Set<string>();
  const emittedToolParamIds = new Set<string>();

  /** 统一工具调用入口，兼容流式事件、非流式 message_end 和直接执行三种路径。 */
  const emitOrdinaryToolCall = (call: ChatCompletionMessageToolCall) => {
    if (
      !call.id ||
      !call.function.name ||
      controlToolNames.has(call.function.name) ||
      emittedToolCallIds.has(call.id)
    ) {
      return;
    }

    emittedToolCallIds.add(call.id);
    runtime.emitEvent?.({
      type: 'tool_call',
      call: {
        ...call,
        function: {
          ...call.function,
          arguments: ''
        }
      }
    });
  };

  /** 记录普通工具参数增量，供执行阶段判断是否需要补发完整参数。 */
  const emitOrdinaryToolParams = ({
    callId,
    toolName,
    argsDelta
  }: {
    callId: string;
    toolName: string;
    argsDelta: string;
  }) => {
    if (!callId || !toolName || controlToolNames.has(toolName) || !emittedToolCallIds.has(callId)) {
      return;
    }

    emittedToolParamIds.add(callId);
    runtime.emitEvent?.({
      type: 'tool_params',
      callId,
      argsDelta
    });
  };

  /** 没有流式参数事件时，在工具执行前补发一次完整参数。 */
  const emitOrdinaryToolExecution = (call: ChatCompletionMessageToolCall) => {
    emitOrdinaryToolCall(call);
    if (emittedToolParamIds.has(call.id)) return;

    emitOrdinaryToolParams({
      callId: call.id,
      toolName: call.function.name,
      argsDelta: call.function.arguments ?? ''
    });
  };

  /** 将工具结果写入标准 transcript；恢复交互时覆盖旧占位 response，避免同 id 重复。 */
  const recordToolResult = ({
    call,
    response,
    childAssistantMessages = [],
    appendToAssistantMessages = true
  }: {
    call: ChatCompletionMessageToolCall;
    response: string;
    childAssistantMessages?: ChatCompletionMessageParam[];
    appendToAssistantMessages?: boolean;
  }) => {
    const toolMessage: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.Tool,
      tool_call_id: call.id,
      content: response
    };
    const existingToolIndex = completeMessages.findIndex(
      (message) => message.role === 'tool' && message.tool_call_id === call.id
    );
    if (existingToolIndex >= 0) {
      completeMessages[existingToolIndex] = toolMessage;
    } else {
      completeMessages.push(toolMessage);
    }
    completeMessages.push(...childAssistantMessages);
    if (appendToAssistantMessages) {
      assistantMessages.push(toolMessage, ...childAssistantMessages);
    }
  };
  const abortCurrentRunRef: {
    current?: () => void;
  } = {};
  const normalizationTools = getPiAgentNormalizationTools(runtime);
  const retainDatasetCite = runtime.responseParams?.retainDatasetCite ?? true;
  // 直接交互的 Human 回答已回放为末尾 tool response，必须保留整段上下文并继续执行。
  // 只有新 User 输入才拆出最后一条消息交给 prompt，避免重复发送原始需求或丢失工具结果。
  const shouldContinueFromMessages =
    requestMessages.at(-1)?.role === ChatCompletionRequestMessageRoleEnum.Tool;
  const moderatedParamToolCallIds = new Set<string>();
  const toolParamPassCache = new Map<string, Promise<boolean>>();
  const isToolCallParamsAllowed = (call: ChatCompletionMessageToolCall): Promise<boolean> => {
    const cached = toolParamPassCache.get(call.id);
    if (cached) return cached;
    const checkPromise = checkToolParamsModeration({
      toolCalls: [call],
      context: { teamId: runtime.teamId }
    }).then((res) => {
      if (!res.isPass) {
        moderatedParamToolCallIds.add(call.id);
        const maskToolCallArgs = (messages: ChatCompletionMessageParam[]) => {
          messages.forEach((msg) => {
            if (msg.role === ChatCompletionRequestMessageRoleEnum.Assistant && msg.tool_calls) {
              msg.tool_calls = msg.tool_calls.map((tc) =>
                tc.id === call.id ? { ...tc, function: { ...tc.function, arguments: '{}' } } : tc
              );
            }
          });
        };
        maskToolCallArgs(completeMessages);
        maskToolCallArgs(assistantMessages);
      }
      return res.isPass;
    });
    toolParamPassCache.set(call.id, checkPromise);
    return checkPromise;
  };
  let isRunBlocked = false;
  const lastUserMessageIndex = requestMessages.findLastIndex(
    (message) => message.role === ChatCompletionRequestMessageRoleEnum.User
  );
  const standardHistoryMessages =
    !shouldContinueFromMessages && lastUserMessageIndex >= 0
      ? requestMessages.slice(0, lastUserMessageIndex)
      : requestMessages;
  const shouldResumeStandardAsk =
    !input.childrenInteractiveParams && !!pendingMainContext && input.userAnswer !== undefined;
  const shouldResumeAsk = shouldResumeStandardAsk;
  const askResumeId = pendingMainContext?.askToolCallId;
  const standardAskResumeMessages =
    shouldResumeStandardAsk && askResumeId
      ? [
          ...pendingMainContext!.messages,
          {
            role: ChatCompletionRequestMessageRoleEnum.Tool,
            tool_call_id: askResumeId,
            content: normalizeToolResponseContent(
              formatAgentAskToolResponse({
                messages: pendingMainContext!.messages,
                askToolCallId: askResumeId,
                answer: input.userAnswer ?? ''
              })
            )
          } as ChatCompletionMessageParam
        ]
      : undefined;
  // ask resume follows the FastAgent contract: the new user input is represented by
  // the matching tool response, not as another user message in the LLM context.
  const completeMessages: ChatCompletionMessageParam[] = [
    ...(standardAskResumeMessages ?? input.messages)
  ];
  /** 同步核对取消、暂停和工具停止；终止后不能写入续跑历史或事件，不等待取消轮询。 */
  const recordContinuationMessage = (content: string): ChatCompletionMessageParam | undefined => {
    if (pendingAsk || pendingToolChild || pendingToolStop || runtime.checkIsStopping?.()) return;

    const message: ChatCompletionMessageParam = {
      role: ChatCompletionRequestMessageRoleEnum.User,
      content,
      hideInUI: true
    };
    completeMessages.push(message);
    assistantMessages.push(message);
    runtime.emitEvent?.({ type: 'user_message', content, source: 'server' });
    return message;
  };
  const shouldRestoreRawState = !!input.childrenInteractiveParams;
  let initialPiMessages = normalizePiAgentMessages({
    messages:
      shouldRestoreRawState && state.piMessages?.length
        ? state.piMessages
        : convertChatMessagesToPiAgentMessages({
            messages:
              standardAskResumeMessages ??
              (input.childrenInteractiveParams ? input.messages : standardHistoryMessages),
            model: piModel
          }),
    completionTools: normalizationTools
  });
  let resumedInteractiveTool = false;
  let resumedAsk = false;

  if (shouldResumeAsk && !askResumeId) {
    return {
      status: 'error',
      activePlan,
      providerState: state,
      completeMessages,
      assistantMessages,
      requestIds,
      finishReason: 'error',
      usages: [],
      error: new Error('Pending piAgent ask id is missing.')
    };
  }

  if (input.childrenInteractiveParams) {
    if (!runtime.executeInteractiveTool) {
      return {
        status: 'error',
        activePlan,
        providerState: state,
        completeMessages,
        assistantMessages,
        requestIds,
        finishReason,
        usages: [],
        error: new Error('Interactive tool executor is not available.')
      };
    }

    const call = resolveInteractiveToolCall({
      toolCallId: input.childrenInteractiveParams.toolCallId,
      messages: input.messages,
      piMessages: initialPiMessages
    });
    const startedAt = Date.now();
    const result = await (async () => {
      try {
        return await runtime.executeInteractiveTool!({
          ...input.childrenInteractiveParams!,
          call,
          messages: input.messages
        });
      } catch (error) {
        const errText = getErrText(error);
        if (isModerationBlockErrorMessage(errText)) {
          return {
            response: MODERATION_BLOCKED_REPLACE_TEXT,
            assistantMessages: [],
            usages: [],
            stop: false
          };
        }
        const errorMessage = `Tool error: ${errText}`;
        return {
          response: errorMessage,
          assistantMessages: [],
          usages: [],
          stop: false,
          errorMessage
        };
      }
    })();
    if (!isToolResultModerated(result)) {
      const originalResponse = result.response;
      const moderatedResponse = originalResponse
        ? await checkToolResultModeration({
            response: originalResponse,
            context: { teamId: runtime.teamId }
          })
        : originalResponse;
      const hitModeration =
        moderatedResponse !== originalResponse ||
        isModerationBlockErrorMessage(result.errorMessage);
      if (hitModeration) {
        result.response = MODERATION_BLOCKED_REPLACE_TEXT;
        result.errorMessage = undefined;
        result.assistantMessages = [];
        result.assistantResponses = undefined;
        result.metadata = sanitizeModeratedToolNodeResponse(result.metadata);
      }
      markToolResultModerated(result);
    }
    const normalizedResponse = normalizeToolResponseContent(result.response);
    pushAgentLoopUsages(runtime, result.usages);
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      response: normalizedResponse,
      assistantMessages: result.assistantMessages,
      assistantResponses: result.assistantResponses,
      usages: result.usages,
      errorMessage: result.errorMessage,
      metadata: result.metadata,
      seconds: +((Date.now() - startedAt) / 1000).toFixed(2)
    });
    initialPiMessages = replaceInteractiveToolResult({
      messages: initialPiMessages,
      call,
      response: normalizedResponse,
      isError: !!result.errorMessage
    });

    const providerState: PiAgentProviderState = {
      ...state,
      piMessages: initialPiMessages,
      activePlan
    };
    recordToolResult({
      call,
      response: normalizedResponse,
      childAssistantMessages: result.assistantMessages
    });
    if (result.interactive) {
      return {
        status: 'paused',
        pause: {
          interactive: result.interactive,
          toolCallId: call.id
        },
        activePlan,
        providerState,
        completeMessages,
        assistantMessages,
        requestIds,
        finishReason,
        usages: normalizeAgentLoopUsages(result.usages)
      };
    }
    if (result.stop) {
      return {
        status: 'done',
        activePlan,
        providerState,
        completeMessages,
        assistantMessages,
        requestIds,
        finishReason,
        usages: normalizeAgentLoopUsages(result.usages)
      };
    }
    resumedInteractiveTool = true;
  }

  if (shouldResumeAsk && askResumeId) {
    const answer = normalizeToolResponseContent(input.userAnswer);
    resumedAsk = true;
    runtime.emitEvent?.({
      type: 'ask_resume',
      answer
    });
  }

  const toolContinuationMessages: string[] = [];
  const tools = await buildPiAgentTools({
    runtime,
    getActivePlan: () => activePlan,
    setActivePlan: (plan) => {
      activePlan = plan;
    },
    setPendingAsk: (ask, askId) => {
      pendingAsk = ask;
      pendingAskId = askId;
    },
    onAskPending: () => abortCurrentRunRef.current?.(),
    onToolChildPending: (pause) => {
      pendingToolChild = pause;
      abortCurrentRunRef.current?.();
    },
    onToolStop: () => {
      pendingToolStop = true;
      abortCurrentRunRef.current?.();
    },
    getMessages: () => completeMessages,
    onToolCall: emitOrdinaryToolExecution,
    onToolResult: ({ call, response, assistantMessages, continuationMessage }) => {
      recordToolResult({
        call,
        response,
        childAssistantMessages: assistantMessages
      });
      if (continuationMessage) toolContinuationMessages.push(continuationMessage);
    },
    isToolCallParamsAllowed
  });

  const pendingRequests: Array<{
    requestId: string;
    requestIndex: number;
    startedAt: number;
    firstTokenAt?: number;
  }> = [];
  const maxRunAgentTimes = Math.max(1, runtime.maxRunAgentTimes ?? 100);
  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt ?? '',
      model: piModel,
      thinkingLevel: getPiThinkingLevel(modelData, runtime.llmParams.reasoningEffort),
      tools,
      messages: initialPiMessages
    },
    // pi-agent-core 只提供 parallel/sequential 两档。统一使用串行，确保不超过 runtime 的并发上限，
    // 同时避免 plan/ask 和普通工具在同一轮并行修改状态。
    toolExecution: 'sequential',
    getApiKey: () => getModelApiKey(modelData, runtime.llmParams.userKey),
    onPayload: (payload) => {
      if (requestIndex >= maxRunAgentTimes) {
        reachedRunLimit = true;
        throw new Error(`Agent loop reached max run times: ${maxRunAgentTimes}`);
      }
      const requestId = `pi_${getNanoid(12)}`;
      const nextRequest = {
        requestId,
        requestIndex: ++requestIndex,
        startedAt: Date.now()
      };
      pendingRequests.push(nextRequest);
      requestIds.push(requestId);
      runtime.emitEvent?.({
        type: 'llm_request_start',
        requestIndex: nextRequest.requestIndex,
        modelName: modelData.name
      });
      return mergePiAgentPayload({
        payload,
        runtime
      });
    },
    transformContext: async (messages) => {
      // 工具全部执行完后才进入下一次请求，在此追加 User，保持工具结果的完整配对。
      for (const content of toolContinuationMessages.splice(0)) {
        const message = recordContinuationMessage(content);
        if (!message) break;
        const nextMessages = [
          ...messages,
          ...convertChatMessagesToPiAgentMessages({ messages: [message], model: piModel })
        ];
        messages.splice(0, messages.length, ...nextMessages);
        agent.state.messages = nextMessages;
      }
      const startTime = Date.now();
      try {
        const standardMessages = convertPiAgentMessagesToChatMessages(messages);
        const result = await compressRequestMessages({
          activePlan,
          getCheckpointContext: runtime.getCheckpointContext,
          checkIsStopping: runtime.checkIsStopping,
          messages: standardMessages,
          model: modelData,
          reasoningEffort: runtime.llmParams.reasoningEffort,
          tools: normalizationTools,
          userKey: runtime.llmParams.userKey,
          teamId: runtime.teamId
        });
        const usages = normalizeAgentLoopUsages([result.usage]);
        if (usages.length > 0) {
          pushAgentLoopUsages(runtime, usages);
        }

        const hasCompressionResult =
          usages.length > 0 || !!result.contextCheckpoint || (result.requestIds?.length ?? 0) > 0;
        if (hasCompressionResult) {
          runtime.emitEvent?.({
            type: 'after_message_compress',
            modelName: modelData.name,
            usages,
            requestIds: result.requestIds ?? [],
            seconds: +((Date.now() - startTime) / 1000).toFixed(2),
            contextCheckpoint: result.contextCheckpoint
          });
        }

        if (!result.contextCheckpoint) {
          return normalizePiAgentMessages({ messages, completionTools: normalizationTools });
        }

        const compressedPiMessages = normalizePiAgentMessages({
          messages: convertChatMessagesToPiAgentMessages({
            messages: result.messages,
            model: piModel
          }),
          completionTools: normalizationTools
        });

        // pi-agent-core 不会持久化 transformContext 的返回值，需要同步当前请求和 Agent 状态。
        messages.splice(0, messages.length, ...compressedPiMessages);
        agent.state.messages = compressedPiMessages;
        latestContextCheckpoint = result.contextCheckpoint;
        return messages;
      } catch {
        // pi-agent-core 要求 transformContext 不抛错；压缩异常时保留原上下文继续运行。
        return normalizePiAgentMessages({ messages, completionTools: normalizationTools });
      }
    }
  });
  const streamModerationBuffer = await createStreamModerationBuffer({
    context: { teamId: runtime.teamId },
    onApprovedText: (text) => {
      runtime.emitEvent?.({
        type: 'answer_delta',
        text
      });
    },
    onBlocked: () => {
      isRunBlocked = true;
      agent.abort();
    }
  });

  const reasoningModerationBuffer = streamModerationBuffer.enabled
    ? await createStreamModerationBuffer({
        context: { teamId: runtime.teamId },
        onApprovedText: (text) => {
          runtime.emitEvent?.({
            type: 'reasoning_delta',
            text
          });
        },
        onBlocked: () => {
          agent.abort();
        }
      })
    : undefined;

  abortCurrentRunRef.current = () => agent.abort();

  let subscriberQueue = Promise.resolve();
  const handleAgentEvent = async (event: AgentEvent) => {
    if (event.type === 'tool_execution_start') {
      if (
        isRunBlocked ||
        streamModerationBuffer.enabled ||
        moderatedParamToolCallIds.has(event.toolCallId)
      ) {
        return;
      }
      emitOrdinaryToolExecution({
        id: event.toolCallId,
        type: 'function',
        function: {
          name: event.toolName,
          arguments: stringifyJson(event.args)
        }
      });
      return;
    }

    if (event.type === 'message_update') {
      const assistantEvent = event.assistantMessageEvent;
      if (assistantEvent.type === 'text_delta') {
        const request = pendingRequests[0];
        if (request) request.firstTokenAt ??= Date.now();
        answerText += assistantEvent.delta;
        if (streamModerationBuffer.enabled) {
          await streamModerationBuffer.push(assistantEvent.delta);
        } else {
          runtime.emitEvent?.({
            type: 'answer_delta',
            text: assistantEvent.delta
          });
        }
        return;
      }
      if (assistantEvent.type === 'thinking_delta') {
        const request = pendingRequests[0];
        if (request) request.firstTokenAt ??= Date.now();
        reasoningText += assistantEvent.delta;
        if (reasoningModerationBuffer?.enabled) {
          await reasoningModerationBuffer.push(assistantEvent.delta);
        } else {
          runtime.emitEvent?.({
            type: 'reasoning_delta',
            text: assistantEvent.delta
          });
        }
        return;
      }
      if (assistantEvent.type === 'toolcall_start' || assistantEvent.type === 'toolcall_delta') {
        if (isRunBlocked) return;
        const toolCall = assistantEvent.partial.content[assistantEvent.contentIndex];
        if (toolCall?.type !== 'toolCall') return;

        emitOrdinaryToolCall({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: ''
          }
        });
        if (
          assistantEvent.type === 'toolcall_delta' &&
          assistantEvent.delta &&
          emittedToolCallIds.has(toolCall.id) &&
          !controlToolNames.has(toolCall.name)
        ) {
          if (!streamModerationBuffer.enabled) {
            emitOrdinaryToolParams({
              callId: toolCall.id,
              toolName: toolCall.name,
              argsDelta: assistantEvent.delta
            });
          }
        }
      }
      return;
    }

    if (event.type === 'message_end' && isAssistantMessage(event.message)) {
      const request = pendingRequests.shift() || {
        requestId: `pi_${getNanoid(12)}`,
        requestIndex: ++requestIndex,
        startedAt: Date.now()
      };
      if (!requestIds.includes(request.requestId)) {
        requestIds.push(request.requestId);
      }

      if (streamModerationBuffer.enabled) {
        try {
          await Promise.all([streamModerationBuffer.flush(), reasoningModerationBuffer?.flush()]);
        } catch (err) {
          latestError = err;
        }
      }

      const isContentBlocked = streamModerationBuffer.blocked || reasoningModerationBuffer?.blocked;

      const [normalizedMessage] = normalizePiAgentMessages({
        messages: [event.message],
        completionTools: normalizationTools
      });
      const assistantMessage = isAssistantMessage(normalizedMessage)
        ? normalizedMessage
        : event.message;
      const messageData = readAssistantMessage(assistantMessage);

      if (messageData.toolCalls.length && streamModerationBuffer.enabled) {
        const allowedList = await Promise.all(
          messageData.toolCalls.map((call) => isToolCallParamsAllowed(call))
        );
        messageData.toolCalls = messageData.toolCalls.map((call, idx) =>
          allowedList[idx]
            ? call
            : {
                ...call,
                function: {
                  ...call.function,
                  arguments: '{}'
                }
              }
        );
        event.message.content.forEach((item) => {
          if (item.type === 'toolCall' && moderatedParamToolCallIds.has(item.id)) {
            item.arguments = {};
          }
        });
      }
      const isBlocked = isContentBlocked;
      if (isBlocked) {
        isRunBlocked = true;
        answerText = '';
        latestAnswerText = '';
        reasoningText = '';
        messageData.answerText = '';
        messageData.reasoningText = '';
        messageData.toolCalls = [];
        latestError ||= new UserError(MODERATION_BLOCKED_ERROR_MESSAGE);
        agent.abort();
      } else {
        messageData.toolCalls.forEach(emitOrdinaryToolCall);
        if (!answerText && messageData.answerText) {
          answerText = messageData.answerText;
        }
        latestAnswerText = messageData.answerText;
        if (!reasoningText && messageData.reasoningText) {
          reasoningText = messageData.reasoningText;
        }
      }

      const standardAssistantMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: isBlocked
          ? null
          : removeDatasetCiteText(messageData.answerText, retainDatasetCite) || null,
        ...(modelData.config.reasoning || (!isBlocked && messageData.reasoningText)
          ? {
              reasoning_content: isBlocked
                ? undefined
                : removeDatasetCiteText(messageData.reasoningText, retainDatasetCite)
            }
          : {}),
        ...(!isBlocked && messageData.toolCalls.length ? { tool_calls: messageData.toolCalls } : {})
      };
      const toolCallIds = new Set(messageData.toolCalls.map((call) => call.id));
      const completeToolResponseIndex = completeMessages.findIndex(
        (message) => message.role === 'tool' && toolCallIds.has(message.tool_call_id)
      );
      const assistantToolResponseIndex = assistantMessages.findIndex(
        (message) => message.role === 'tool' && toolCallIds.has(message.tool_call_id)
      );
      if (completeToolResponseIndex >= 0) {
        completeMessages.splice(completeToolResponseIndex, 0, standardAssistantMessage);
      } else {
        completeMessages.push(standardAssistantMessage);
      }
      if (assistantToolResponseIndex >= 0) {
        assistantMessages.splice(assistantToolResponseIndex, 0, standardAssistantMessage);
      } else {
        assistantMessages.push(standardAssistantMessage);
      }

      const requestInputTokens = event.message.usage?.input || 0;
      const requestOutputTokens = event.message.usage?.output || 0;
      const totalPoints = runtime.llmParams.userKey?.key
        ? 0
        : formatModelChars2Points({
            model: modelData,
            inputTokens: requestInputTokens,
            outputTokens: requestOutputTokens
          }).totalPoints;
      inputTokens += requestInputTokens;
      outputTokens += requestOutputTokens;
      llmTotalPoints += totalPoints;
      const usage: AgentLoopUsage = {
        moduleName: AgentUsageModuleName.agentCall,
        modelId: modelData.modelId,
        totalPoints,
        inputTokens: requestInputTokens,
        outputTokens: requestOutputTokens
      };
      pushAgentLoopUsages(runtime, [usage]);

      finishReason = isBlocked ? 'error' : mapStopReason(event.message.stopReason);
      runtime.emitEvent?.({
        type: 'llm_request_end',
        requestIndex: request.requestIndex,
        modelName: modelData.name,
        requestId: request.requestId,
        finishReason,
        answerText: isBlocked ? '' : messageData.answerText,
        reasoningText: isBlocked ? '' : messageData.reasoningText,
        toolCalls: isBlocked ? [] : messageData.toolCalls,
        usages: [usage],
        seconds: +((Date.now() - request.startedAt) / 1000).toFixed(2),
        firstTokenTime:
          request.firstTokenAt === undefined
            ? undefined
            : +((request.firstTokenAt - request.startedAt) / 1000).toFixed(2),
        error: isBlocked ? latestError : event.message.errorMessage
      });
      return;
    }

    if (event.type === 'turn_end') {
      const errMsg = (event.message as { errorMessage?: string }).errorMessage;
      if (errMsg) latestError = errMsg;
    }
  };
  agent.subscribe((event: AgentEvent) => {
    const task = handleAgentEvent(event);
    subscriberQueue = subscriberQueue.then(
      () => task,
      () => task
    );
  });

  const stopPoller = setInterval(() => {
    if (runtime.checkIsStopping?.()) {
      agent.abort();
    }
  }, 200);

  // 仅团队成员模型启用运行时 SSRF 防护；系统模型保持原有传输。
  const legacyEndpoint = isTeamModel(modelData) ? getLegacyModelEndpoint(modelData) : undefined;
  const runAgent = <T>(run: () => Promise<T>): Promise<T> => {
    if (!legacyEndpoint) return run();
    installSafeLegacyFetchShim();
    return runWithSafeLegacyFetch(legacyEndpoint.baseUrl, run);
  };

  try {
    if (resumedInteractiveTool || resumedAsk || shouldContinueFromMessages) {
      await runAgent(() => agent.continue());
    } else {
      const prompt = getPiAgentPrompt(requestMessages);
      const currentUserMessage = requestMessages[lastUserMessageIndex];
      const piPromptMessage =
        currentUserMessage?.role === ChatCompletionRequestMessageRoleEnum.User &&
        Array.isArray(currentUserMessage.content) &&
        !shouldResumeAsk
          ? convertChatMessagesToPiAgentMessages({
              messages: [currentUserMessage],
              model: piModel
            })[0]
          : undefined;

      if (piPromptMessage) {
        await runAgent(() => agent.prompt(piPromptMessage));
      } else {
        await runAgent(() => agent.prompt(prompt));
      }
    }

    while (
      runtime.completionPolicy &&
      !pendingAsk &&
      !pendingToolChild &&
      !pendingToolStop &&
      !runtime.checkIsStopping?.() &&
      !latestError &&
      !agent.state.errorMessage &&
      !reachedRunLimit
    ) {
      const decision = await runtime.completionPolicy({
        requestIndex,
        answerText: latestAnswerText
      });
      if (decision.action === 'complete') break;
      if (requestIndex >= maxRunAgentTimes) {
        reachedRunLimit = true;
        latestError = new Error(`Agent loop reached max run times: ${maxRunAgentTimes}`);
        break;
      }

      if (!recordContinuationMessage(decision.message)) break;
      await runAgent(() => agent.prompt(decision.message));
    }
  } catch (error) {
    latestError = error;
  } finally {
    clearInterval(stopPoller);
    await subscriberQueue;
  }

  if (streamModerationBuffer.enabled) {
    try {
      await Promise.all([streamModerationBuffer.flush(), reasoningModerationBuffer?.flush()]);
    } catch (err) {
      latestError = err;
    }
    if (isRunBlocked || streamModerationBuffer.blocked || reasoningModerationBuffer?.blocked) {
      isRunBlocked = true;
      answerText = '';
      reasoningText = '';
      latestError ||= new UserError(MODERATION_BLOCKED_ERROR_MESSAGE);
      completeMessages.forEach((msg) => {
        if (msg.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          msg.content = '';
          delete msg.reasoning_content;
          delete msg.tool_calls;
        }
      });
      assistantMessages.forEach((msg) => {
        if (msg.role === ChatCompletionRequestMessageRoleEnum.Assistant) {
          msg.content = '';
          delete msg.reasoning_content;
          delete msg.tool_calls;
        }
      });
    }
  }

  if (pendingRequests.length > 0) {
    const requestError = latestError || agent.state.errorMessage || 'Agent request interrupted';
    const requestFinishReason = runtime.checkIsStopping?.() ? 'close' : 'error';
    finishReason = requestFinishReason;
    pendingRequests.splice(0).forEach((request) => {
      runtime.emitEvent?.({
        type: 'llm_request_end',
        requestIndex: request.requestIndex,
        modelName: modelData.name,
        requestId: request.requestId,
        finishReason: requestFinishReason,
        usages: [],
        seconds: +((Date.now() - request.startedAt) / 1000).toFixed(2),
        firstTokenTime:
          request.firstTokenAt === undefined
            ? undefined
            : +((request.firstTokenAt - request.startedAt) / 1000).toFixed(2),
        error: requestError
      });
    });
  }

  const resolvedPendingAskId = pendingAsk ? pendingAskId || `pi_ask_${getNanoid(8)}` : undefined;
  // result.usages 只作为 workflow 输出摘要；真实账单已在每次模型/工具事件中通过 usagePush 推送。
  const resultUsages =
    inputTokens || outputTokens || llmTotalPoints
      ? [
          {
            moduleName: AgentUsageModuleName.agentCall,
            modelId: modelData.modelId,
            inputTokens,
            outputTokens,
            totalPoints: llmTotalPoints
          }
        ]
      : [];
  const pendingMainContextForAsk =
    pendingAsk && resolvedPendingAskId
      ? {
          messages: completeMessages.filter(
            (message) => !(message.role === 'tool' && message.tool_call_id === resolvedPendingAskId)
          ),
          askToolCallId: resolvedPendingAskId,
          activePlan
        }
      : undefined;
  const nextProviderState: PiAgentProviderState = pendingMainContextForAsk
    ? { pendingMainContext: pendingMainContextForAsk }
    : {
        piMessages: normalizePiAgentMessages({
          messages: agent.state.messages,
          completionTools: normalizationTools
        }),
        activePlan
      };

  const isModerationBlocked =
    isRunBlocked ||
    streamModerationBuffer.blocked ||
    reasoningModerationBuffer?.blocked ||
    (latestError instanceof UserError && latestError.message === MODERATION_BLOCKED_ERROR_MESSAGE);

  if (
    !isModerationBlocked &&
    pendingAsk &&
    resolvedPendingAskId &&
    !moderatedParamToolCallIds.has(resolvedPendingAskId)
  ) {
    runtime.emitEvent?.({
      type: 'ask',
      ask: pendingAsk,
      providerState: nextProviderState
    });

    return {
      status: 'paused',
      pause: {
        toolCallId: resolvedPendingAskId,
        interactive: {
          type: 'agentAsk',
          params: {
            toolCallId: resolvedPendingAskId,
            arguments: resolveInteractiveToolCall({
              toolCallId: resolvedPendingAskId,
              messages: completeMessages,
              piMessages: agent.state.messages
            }).function.arguments
          }
        }
      },
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages
    };
  }

  if (
    !isModerationBlocked &&
    pendingToolChild &&
    !moderatedParamToolCallIds.has(pendingToolChild.toolCallId)
  ) {
    return {
      status: 'paused',
      pause: {
        toolCallId: pendingToolChild.toolCallId,
        interactive: pendingToolChild.childrenResponse
      },
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages
    };
  }

  if (!isModerationBlocked && pendingToolStop) {
    return {
      status: 'done',
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages
    };
  }

  if (!isModerationBlocked && runtime.checkIsStopping?.()) {
    return {
      status: 'aborted',
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages
    };
  }

  if (isModerationBlocked) {
    return {
      status: 'error',
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason: 'error',
      usages: resultUsages,
      error: latestError || new UserError(MODERATION_BLOCKED_ERROR_MESSAGE)
    };
  }

  if (reachedRunLimit) {
    if (runtime.completionPolicy) {
      return {
        status: 'error',
        activePlan,
        providerState: nextProviderState,
        completeMessages,
        assistantMessages,
        requestIds,
        contextCheckpoint: latestContextCheckpoint,
        finishReason: 'error',
        usages: resultUsages,
        error: latestError || new Error(`Agent loop reached max run times: ${maxRunAgentTimes}`)
      };
    }
    return {
      status: 'done',
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages
    };
  }

  if (latestError || agent.state.errorMessage) {
    return {
      status: 'error',
      activePlan,
      providerState: nextProviderState,
      completeMessages,
      assistantMessages,
      requestIds,
      contextCheckpoint: latestContextCheckpoint,
      finishReason,
      usages: resultUsages,
      error: latestError || agent.state.errorMessage
    };
  }

  return {
    status: 'done',
    activePlan,
    providerState: nextProviderState,
    completeMessages,
    assistantMessages,
    requestIds,
    contextCheckpoint: latestContextCheckpoint,
    finishReason,
    usages: resultUsages
  };
};
