import { Agent, type AgentEvent } from '@mariozechner/pi-agent-core';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { ChatCompletionRequestMessageRoleEnum } from '@fastgpt/global/core/ai/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { removeDatasetCiteText } from '@fastgpt/global/core/ai/llm/utils';
import { formatModelChars2Points } from '../../../../../../support/wallet/usage/utils';
import { getLLMModel } from '../../../../model';
import { AgentUsageModuleName } from '../../domain/usage';
import type { AgentAskPayload } from '../../domain/systemTool/ask';
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
import {
  getPiAgentPrompt,
  isAssistantMessage,
  mapStopReason,
  normalizePiAgentMessages,
  readAssistantMessage,
  replaceInteractiveToolResult,
  resolveInteractiveToolCall
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
  const requestIds: string[] = [];
  let requestIndex = 0;
  let answerText = '';
  let reasoningText = '';
  let inputTokens = 0;
  let outputTokens = 0;
  let llmTotalPoints = 0;
  let finishReason: CompletionFinishReason = 'stop';
  let activePlan = input.activePlan ?? state.activePlan;
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
  const completeMessages: ChatCompletionMessageParam[] = [...input.messages];
  const assistantMessages: ChatCompletionMessageParam[] = [];

  /** 将工具结果写入标准 transcript；恢复交互时覆盖旧占位 response，避免同 id 重复。 */
  const recordToolResult = ({
    call,
    response,
    childAssistantMessages = []
  }: {
    call: ChatCompletionMessageToolCall;
    response: string;
    childAssistantMessages?: ChatCompletionMessageParam[];
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
    assistantMessages.push(toolMessage, ...childAssistantMessages);
  };
  const abortCurrentRunRef: {
    current?: () => void;
  } = {};
  const normalizationTools = getPiAgentNormalizationTools(runtime);
  const retainDatasetCite = runtime.responseParams?.retainDatasetCite ?? true;
  let initialPiMessages = normalizePiAgentMessages({
    messages: state.piMessages ?? [],
    completionTools: normalizationTools
  });
  let resumedInteractiveTool = false;

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
    pushAgentLoopUsages(runtime, result.usages);
    runtime.emitEvent?.({
      type: 'tool_run_end',
      call,
      rawResponse: result.response,
      response: result.response,
      assistantMessages: result.assistantMessages,
      usages: result.usages,
      errorMessage: result.errorMessage,
      metadata: result.metadata,
      seconds: +((Date.now() - startedAt) / 1000).toFixed(2)
    });
    initialPiMessages = replaceInteractiveToolResult({
      messages: initialPiMessages,
      call,
      response: result.response,
      isError: !!result.errorMessage
    });

    const providerState: PiAgentProviderState = {
      ...state,
      piMessages: initialPiMessages,
      activePlan
    };
    recordToolResult({
      call,
      response: result.response,
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

  if (input.userAnswer !== undefined) {
    runtime.emitEvent?.({
      type: 'ask_resume',
      answer: input.userAnswer
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
    onToolResult: ({ call, response, assistantMessages }) => {
      recordToolResult({
        call,
        response,
        childAssistantMessages: assistantMessages
      });
    }
  });

  const pendingRequests: Array<{ requestId: string; requestIndex: number; startedAt: number }> = [];
  const agent = new Agent({
    initialState: {
      systemPrompt: input.systemPrompt || '',
      model: buildPiModel(
        modelName,
        runtime.llmParams.useVision,
        runtime.llmParams.userKey,
        runtime.llmParams.maxTokens
      ),
      thinkingLevel: getPiThinkingLevel(modelName, runtime.llmParams.reasoningEffort),
      tools,
      messages: initialPiMessages
    },
    getApiKey: () => getModelApiKey(modelName, runtime.llmParams.userKey),
    onPayload: (payload) => {
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
    transformContext: async (messages) =>
      normalizePiAgentMessages({
        messages,
        completionTools: normalizationTools
      })
  });
  abortCurrentRunRef.current = () => agent.abort();

  agent.subscribe((event: AgentEvent) => {
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
    if (resumedInteractiveTool) {
      await agent.continue();
    } else {
      await agent.prompt(
        getPiAgentPrompt({
          messages: input.messages,
          pendingAsk: state.pendingAsk,
          userAnswer: input.userAnswer
        })
      );
    }
  } catch (error) {
    latestError = error;
  } finally {
    clearInterval(stopPoller);
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
  const nextProviderState: PiAgentProviderState = {
    piMessages: normalizePiAgentMessages({
      messages: agent.state.messages,
      completionTools: normalizationTools
    }),
    activePlan,
    ...(pendingAsk ? { pendingAsk } : {}),
    ...(resolvedPendingAskId ? { pendingAskId: resolvedPendingAskId } : {})
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
    finishReason,
    usages: resultUsages
  };
};
