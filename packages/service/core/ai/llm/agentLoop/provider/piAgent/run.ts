import { Agent, type AgentEvent } from '@mariozechner/pi-agent-core';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  normalizeToolResponseContent,
  removeDatasetCiteText
} from '@fastgpt/global/core/ai/llm/utils';
import { loadRequestMessages } from '../../../utils';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { getLLMModel } from '../../../../model';
import { AgentUsageModuleName } from '../../domain/usage';
import { getMainAgentSystemPrompt } from '../../domain/mainPrompt';
import { askUserToolName, type AgentAskPayload } from '../../domain/systemTool/ask';
import { setPlanToolName, updatePlanToolName } from '../../domain/systemTool/plan';
import {
  normalizeAgentLoopUsages,
  type AgentLoopInput,
  type AgentLoopResult,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../../domain';
import { buildPiModel, getModelApiKey, getPiThinkingLevel } from './modelBridge';
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
  const modelName = runtime.llmParams.model;
  const modelData = getLLMModel(modelName);
  const piModel = buildPiModel(
    modelName,
    runtime.llmParams.useVision,
    runtime.llmParams.userKey,
    runtime.llmParams.maxTokens
  );
  const requestMessages = await loadRequestMessages({
    messages: input.messages,
    useVision: runtime.llmParams.useVision && modelData.vision,
    useAudio: runtime.llmParams.useAudio && modelData.audio,
    useVideo: runtime.llmParams.useVideo && modelData.video,
    extractFiles: runtime.llmParams.extractFiles,
    supportReason: modelData.reasoning
  });
  const requestIds: string[] = [];
  let requestIndex = 0;
  let answerText = '';
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
  const lastUserMessageIndex = requestMessages.findLastIndex(
    (message) => message.role === ChatCompletionRequestMessageRoleEnum.User
  );
  const standardHistoryMessages =
    lastUserMessageIndex >= 0 ? requestMessages.slice(0, lastUserMessageIndex) : requestMessages;
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
            content: normalizeToolResponseContent(input.userAnswer)
          } as ChatCompletionMessageParam
        ]
      : undefined;
  // ask resume follows the FastAgent contract: the new user input is represented by
  // the matching tool response, not as another user message in the LLM context.
  const completeMessages: ChatCompletionMessageParam[] = [
    ...(standardAskResumeMessages ?? input.messages)
  ];
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
      toolCallId: input.childrenInteractiveParams.toolParams.toolCallId,
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
        const errorMessage = `Tool error: ${getErrText(error)}`;
        return {
          response: errorMessage,
          assistantMessages: [],
          usages: [],
          stop: false,
          errorMessage
        };
      }
    })();
    const normalizedResponse = normalizeToolResponseContent(result.response);
    pushAgentLoopUsages(runtime, result.usages);
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      rawResponse: result.response,
      response: normalizedResponse,
      assistantMessages: result.assistantMessages,
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
          type: 'tool_child',
          childrenResponse: result.interactive,
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
    onToolResult: ({ call, response, assistantMessages }) => {
      recordToolResult({
        call,
        response,
        childAssistantMessages: assistantMessages
      });
    }
  });

  const pendingRequests: Array<{ requestId: string; requestIndex: number; startedAt: number }> = [];
  const maxRunAgentTimes = Math.max(1, runtime.maxRunAgentTimes ?? 100);
  const systemPrompt =
    runtime.llmParams.promptMode === 'raw'
      ? input.systemPrompt || ''
      : getMainAgentSystemPrompt({
          systemPrompt: input.systemPrompt,
          hasRuntimeTools:
            runtime.toolCatalog.runtimeTools.length > 0 ||
            runtime.systemTools?.sandbox?.enabled === true ||
            runtime.systemTools?.readFile?.enabled === true ||
            runtime.systemTools?.datasetSearch?.enabled === true
        });
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: piModel,
      thinkingLevel: getPiThinkingLevel(modelName, runtime.llmParams.reasoningEffort),
      tools,
      messages: initialPiMessages
    },
    // pi-agent-core 只提供 parallel/sequential 两档。统一使用串行，确保不超过 runtime 的并发上限，
    // 同时避免 plan/ask 和普通工具在同一轮并行修改状态。
    toolExecution: 'sequential',
    getApiKey: () => getModelApiKey(modelName, runtime.llmParams.userKey),
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
      const startTime = Date.now();
      try {
        const standardMessages = convertPiAgentMessagesToChatMessages(messages);
        const result = await compressRequestMessages({
          activePlan,
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
  abortCurrentRunRef.current = () => agent.abort();

  agent.subscribe((event: AgentEvent) => {
    if (event.type === 'tool_execution_start') {
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
        answerText += assistantEvent.delta;
        runtime.emitEvent?.({
          type: 'answer_delta',
          text: assistantEvent.delta
        });
        return;
      }
      if (assistantEvent.type === 'thinking_delta') {
        reasoningText += assistantEvent.delta;
        runtime.emitEvent?.({
          type: 'reasoning_delta',
          text: assistantEvent.delta
        });
        return;
      }
      if (assistantEvent.type === 'toolcall_start' || assistantEvent.type === 'toolcall_delta') {
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
          emitOrdinaryToolParams({
            callId: toolCall.id,
            toolName: toolCall.name,
            argsDelta: assistantEvent.delta
          });
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

      const [normalizedMessage] = normalizePiAgentMessages({
        messages: [event.message],
        completionTools: normalizationTools
      });
      const assistantMessage = isAssistantMessage(normalizedMessage)
        ? normalizedMessage
        : event.message;
      const messageData = readAssistantMessage(assistantMessage);
      messageData.toolCalls.forEach(emitOrdinaryToolCall);
      if (!answerText && messageData.answerText) {
        answerText = messageData.answerText;
      }
      if (!reasoningText && messageData.reasoningText) {
        reasoningText = messageData.reasoningText;
      }
      const standardAssistantMessage: ChatCompletionMessageParam = {
        role: ChatCompletionRequestMessageRoleEnum.Assistant,
        content: removeDatasetCiteText(messageData.answerText, retainDatasetCite) || null,
        ...(messageData.reasoningText
          ? {
              reasoning_content: removeDatasetCiteText(messageData.reasoningText, retainDatasetCite)
            }
          : {}),
        ...(messageData.toolCalls.length ? { tool_calls: messageData.toolCalls } : {})
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
        model: modelData.name,
        totalPoints,
        inputTokens: requestInputTokens,
        outputTokens: requestOutputTokens
      };
      pushAgentLoopUsages(runtime, [usage]);

      finishReason = mapStopReason(event.message.stopReason);
      runtime.emitEvent?.({
        type: 'llm_request_end',
        requestIndex: request.requestIndex,
        modelName: modelData.name,
        requestId: request.requestId,
        finishReason,
        answerText: messageData.answerText,
        reasoningText: messageData.reasoningText,
        toolCalls: messageData.toolCalls,
        usages: [usage],
        seconds: +((Date.now() - request.startedAt) / 1000).toFixed(2),
        error: event.message.errorMessage
      });
      return;
    }

    if (event.type === 'turn_end') {
      const errMsg = (event.message as { errorMessage?: string }).errorMessage;
      if (errMsg) latestError = errMsg;
    }
  });

  const stopPoller = setInterval(() => {
    if (runtime.checkIsStopping?.()) {
      agent.abort();
    }
  }, 200);

  try {
    if (resumedInteractiveTool || resumedAsk) {
      await agent.continue();
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
        await agent.prompt(piPromptMessage);
      } else {
        await agent.prompt(prompt);
      }
    }
  } catch (error) {
    latestError = error;
  } finally {
    clearInterval(stopPoller);
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

  if (pendingAsk && resolvedPendingAskId) {
    runtime.emitEvent?.({
      type: 'ask',
      ask: pendingAsk,
      providerState: nextProviderState
    });

    return {
      status: 'paused',
      pause: {
        type: 'ask',
        ask: pendingAsk,
        askId: resolvedPendingAskId
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

  if (pendingToolChild) {
    return {
      status: 'paused',
      pause: {
        type: 'tool_child',
        ...pendingToolChild
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

  if (pendingToolStop) {
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

  if (runtime.checkIsStopping?.()) {
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

  if (reachedRunLimit) {
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
