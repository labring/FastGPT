import { customNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentEvent } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Model, StopReason, ToolCall } from '@mariozechner/pi-ai';
import { saveLLMRequestRecord, createLLMRequestId } from '../../../../../../ai/record/controller';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { WorkflowResponseType } from '../../../../type';
import type { DispatchAgentModuleProps } from '../..';
import { i18nT } from '../../../../../../../../web/i18n/utils';

const AGENT_CALL_USAGE_MODULE_NAME = 'account_usage:agent_call';

const createFallbackRequestId = () =>
  `pi_${customNanoid('abcdefghijklmnopqrstuvwxyz1234567890', 12)}`;

const mapStopReason = (reason?: StopReason): CompletionFinishReason => {
  if (reason === 'toolUse') return 'tool_calls';
  if (reason === 'length') return 'length';
  if (reason === 'error') return 'error';
  if (reason === 'aborted') return 'close';
  return 'stop';
};

const stringifyToolArguments = (args: Record<string, unknown> | undefined) => {
  try {
    return JSON.stringify(args ?? {});
  } catch {
    return '{}';
  }
};

const formatToolCalls = (toolCalls: ToolCall[]): ChatCompletionMessageToolCall[] =>
  toolCalls.map((toolCall) => ({
    id: toolCall.id || createFallbackRequestId(),
    type: 'function',
    function: {
      name: toolCall.name,
      arguments: stringifyToolArguments(toolCall.arguments)
    }
  }));

const readAssistantMessage = (message: AssistantMessage) => {
  let answerText = '';
  let reasoningText = '';
  const toolCalls: ToolCall[] = [];

  message.content.forEach((item) => {
    if (item.type === 'text') {
      answerText += item.text || '';
      return;
    }
    if (item.type === 'thinking') {
      reasoningText += item.thinking || '';
      return;
    }
    if (item.type === 'toolCall') {
      toolCalls.push(item);
    }
  });

  return {
    answerText,
    reasoningText,
    toolCalls: formatToolCalls(toolCalls)
  };
};

const isAssistantMessage = (message: unknown): message is AssistantMessage =>
  !!message && typeof message === 'object' && (message as { role?: string }).role === 'assistant';

type PendingRequest = {
  requestId: string;
  requestIndex: number;
  modelName: string;
  body: unknown;
  startTime: number;
};

export type PiAgentWorkflowRuntimeArtifacts = {
  getAnswerText: () => string;
  getReasoningText: () => string;
  appendChildNodeResponse: (nodeResponse: ChatHistoryItemResType) => void;
  onPayload: (payload: unknown, model: Model<any>) => undefined;
  handleAgentEvent: (event: AgentEvent) => void;
};

export const createPiAgentWorkflowRuntime = ({
  props,
  nodeResponses,
  workflowStreamResponse,
  usagePush
}: {
  props: DispatchAgentModuleProps;
  nodeResponses: ChatHistoryItemResType[];
  workflowStreamResponse?: WorkflowResponseType;
  usagePush: DispatchAgentModuleProps['usagePush'];
}): PiAgentWorkflowRuntimeArtifacts => {
  const modelData = getLLMModel(props.params.model);
  const pendingRequests: PendingRequest[] = [];
  let requestIndex = 0;
  let answerText = '';
  let reasoningText = '';
  let activeAgentResponse: ChatHistoryItemResType | undefined;

  const addChildPointsToActiveAgent = (childPoints?: number) => {
    if (!activeAgentResponse || !childPoints) return;

    activeAgentResponse.childTotalPoints = +(
      (activeAgentResponse.childTotalPoints || 0) + childPoints
    ).toFixed(12);
    activeAgentResponse.totalPoints = +(
      (activeAgentResponse.totalPoints || 0) + childPoints
    ).toFixed(12);
  };

  const appendChildNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    if (activeAgentResponse) {
      activeAgentResponse.childrenResponses = [
        ...(activeAgentResponse.childrenResponses || []),
        nodeResponse
      ];
      addChildPointsToActiveAgent(nodeResponse.totalPoints);
      return;
    }

    nodeResponses.push(nodeResponse);
  };

  const saveRequestRecord = ({
    request,
    response
  }: {
    request: PendingRequest;
    response: Record<string, unknown>;
  }) => {
    void saveLLMRequestRecord({
      requestId: request.requestId,
      body: request.body,
      response
    });
  };

  const appendAgentNodeResponse = ({
    request,
    message,
    answerText,
    reasoningText,
    toolCalls
  }: {
    request: PendingRequest;
    message: AssistantMessage;
    answerText: string;
    reasoningText: string;
    toolCalls: ChatCompletionMessageToolCall[];
  }) => {
    const inputTokens = message.usage?.input || 0;
    const outputTokens = message.usage?.output || 0;
    const totalPoints = props.externalProvider.openaiAccount
      ? 0
      : formatModelChars2Points({
          model: modelData,
          inputTokens,
          outputTokens
        }).totalPoints;
    const finishReason = mapStopReason(message.stopReason);
    const errorText = message.errorMessage;
    const seconds = +((Date.now() - request.startTime) / 1000).toFixed(2);

    const usage: ChatNodeUsageType = {
      moduleName: AGENT_CALL_USAGE_MODULE_NAME,
      model: modelData.name,
      totalPoints,
      inputTokens,
      outputTokens
    };
    usagePush([usage]);

    saveRequestRecord({
      request,
      response: {
        ...(answerText && { answerText }),
        ...(reasoningText && { reasoningText }),
        ...(toolCalls.length > 0 && { toolCalls }),
        finish_reason: finishReason,
        usage: {
          inputTokens,
          outputTokens
        },
        ...(errorText && { error: errorText })
      }
    });

    const agentResponse: ChatHistoryItemResType = {
      id: `${props.node.nodeId}-${request.requestIndex}-${request.requestId}`,
      nodeId: `${props.node.nodeId}-pi-${request.requestIndex}`,
      moduleName: i18nT('chat:master_agent_call'),
      moduleType: props.node.flowNodeType,
      moduleLogo: 'core/app/type/agentFill',
      runningTime: seconds,
      model: request.modelName || modelData.name,
      llmRequestIds: [request.requestId],
      inputTokens,
      outputTokens,
      totalPoints,
      finishReason,
      textOutput: answerText,
      reasoningText,
      ...(errorText ? { errorText: getErrText(errorText) } : {})
    };

    activeAgentResponse = agentResponse;
    nodeResponses.push(agentResponse);
  };

  return {
    getAnswerText: () => answerText,
    getReasoningText: () => reasoningText,
    appendChildNodeResponse,
    onPayload: (payload, model) => {
      const request: PendingRequest = {
        requestId: createLLMRequestId(),
        requestIndex: ++requestIndex,
        modelName: model?.name || modelData.name,
        body: payload,
        startTime: Date.now()
      };
      pendingRequests.push(request);

      workflowStreamResponse?.({
        event: SseResponseEventEnum.flowNodeStatus,
        data: {
          status: 'running',
          name: request.modelName
        }
      });

      return undefined;
    },
    handleAgentEvent: (event) => {
      if (event.type === 'message_update') {
        const assistantEvent = event.assistantMessageEvent;
        if (assistantEvent.type === 'text_delta') {
          answerText += assistantEvent.delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ text: assistantEvent.delta })
          });
          return;
        }
        if (assistantEvent.type === 'thinking_delta') {
          reasoningText += assistantEvent.delta;
          workflowStreamResponse?.({
            event: SseResponseEventEnum.answer,
            data: textAdaptGptResponse({ reasoning_content: assistantEvent.delta })
          });
          return;
        }
        return;
      }

      if (event.type === 'message_end' && isAssistantMessage(event.message)) {
        const request = pendingRequests.shift() || {
          requestId: createFallbackRequestId(),
          requestIndex: ++requestIndex,
          modelName: modelData.name,
          body: {},
          startTime: Date.now()
        };
        const messageData = readAssistantMessage(event.message);
        if (!answerText && messageData.answerText) {
          answerText = messageData.answerText;
        }
        if (!reasoningText && messageData.reasoningText) {
          reasoningText = messageData.reasoningText;
        }
        appendAgentNodeResponse({
          request,
          message: event.message,
          answerText: messageData.answerText,
          reasoningText: messageData.reasoningText,
          toolCalls: messageData.toolCalls
        });
        return;
      }

      if (event.type === 'turn_end') {
        const errMsg = (event.message as { errorMessage?: string }).errorMessage;
        if (errMsg) {
          // 错误已在 message_end 的 nodeResponse/request record 中记录，这里只保留日志入口。
          return;
        }
      }
    }
  };
};
