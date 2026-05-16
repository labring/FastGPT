import { customNanoid } from '@fastgpt/global/common/string/tools';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type {
  ChatCompletionTool,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentEvent, AgentMessage } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Model, StopReason, ToolCall } from '@mariozechner/pi-ai';
import { saveLLMRequestRecord, createLLMRequestId } from '../../../../../../ai/record/controller';
import { getLLMModel } from '../../../../../../ai/model';
import { formatModelChars2Points } from '../../../../../../../support/wallet/usage/utils';
import type { WorkflowResponseType } from '../../../../type';
import type { DispatchAgentModuleProps } from '../..';
import {
  AgentNodeResponseDisplay,
  AgentUsageModuleName
} from '../../../../../../ai/llm/agentLoop/constants';
import { completionFinishReasonMap } from '@fastgpt/global/core/ai/constants';

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

type AssistantContentItem = AssistantMessage['content'][number];
type ToolMatchInfo = {
  properties: Set<string>;
  required: Set<string>;
};

const isObjectRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isEmptyToolArguments = (args: unknown) =>
  !isObjectRecord(args) || Object.keys(args).length === 0;

const isToolCallContent = (item: AssistantContentItem): item is ToolCall =>
  item.type === 'toolCall';

const getToolMatchInfo = (tool: ChatCompletionTool): ToolMatchInfo => {
  const schema = tool.function.parameters as
    | {
        properties?: Record<string, unknown>;
        required?: string[];
      }
    | undefined;

  return {
    properties: new Set(Object.keys(schema?.properties || {})),
    required: new Set(schema?.required || [])
  };
};

const scoreToolArguments = ({
  toolName,
  args,
  toolInfoMap
}: {
  toolName: string;
  args: Record<string, unknown>;
  toolInfoMap: Map<string, ToolMatchInfo>;
}) => {
  const argKeys = Object.keys(args);
  if (argKeys.length === 0) return 0;

  const toolInfo = toolInfoMap.get(toolName);
  if (!toolInfo) return 1;

  const propertyHits = argKeys.filter((key) => toolInfo.properties.has(key)).length;
  const requiredHits = argKeys.filter((key) => toolInfo.required.has(key)).length;
  const hasSchemaKeys = toolInfo.properties.size > 0 || toolInfo.required.size > 0;

  if (hasSchemaKeys && propertyHits === 0 && requiredHits === 0) return -1;

  return propertyHits + requiredHits * 4;
};

const normalizeAssistantToolCalls = ({
  message,
  completionTools = []
}: {
  message: AssistantMessage;
  completionTools?: ChatCompletionTool[];
}) => {
  const toolInfoMap = new Map(
    completionTools.map((tool) => [tool.function.name, getToolMatchInfo(tool)] as const)
  );
  const normalizedContent: AssistantContentItem[] = [];

  const canMergeIntoToolCall = (
    item: AssistantContentItem,
    args: Record<string, unknown>
  ): item is ToolCall => {
    if (!isToolCallContent(item) || !item.name) return false;

    const score = scoreToolArguments({
      toolName: item.name,
      args,
      toolInfoMap
    });
    if (score < 0) return false;

    // 空参数的命名 toolCall 是 provider streaming 拆块时最常见的合并目标。
    if (isEmptyToolArguments(item.arguments)) return true;

    // 同一个工具的参数可能被拆成多个匿名块；有 schema 命中时继续合并。
    return score > 0;
  };

  const findMergeTargetIndex = (args: Record<string, unknown>) => {
    const previousIndex = normalizedContent.length - 1;
    const previousItem = normalizedContent[previousIndex];
    if (previousItem && canMergeIntoToolCall(previousItem, args)) {
      const previousScore = scoreToolArguments({
        toolName: previousItem.name,
        args,
        toolInfoMap
      });
      if (previousScore >= 0) return previousIndex;
    }

    let bestIndex = -1;
    let bestScore = -1;
    normalizedContent.forEach((item, index) => {
      if (!canMergeIntoToolCall(item, args)) return;

      const score = scoreToolArguments({
        toolName: item.name,
        args,
        toolInfoMap
      });
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });

    return bestIndex;
  };

  for (const item of message.content) {
    if (!isToolCallContent(item)) {
      normalizedContent.push(item);
      continue;
    }

    const toolArguments = isObjectRecord(item.arguments) ? item.arguments : {};
    if (item.name) {
      normalizedContent.push({
        ...item,
        id: item.id || createFallbackRequestId(),
        arguments: toolArguments
      });
      continue;
    }

    const mergeTargetIndex = findMergeTargetIndex(toolArguments);
    const target = normalizedContent[mergeTargetIndex];
    if (target && isToolCallContent(target)) {
      normalizedContent[mergeTargetIndex] = {
        ...target,
        arguments: {
          ...(isObjectRecord(target.arguments) ? target.arguments : {}),
          ...toolArguments
        }
      };
    }
  }

  message.content = normalizedContent.filter((item) => !isToolCallContent(item) || !!item.name);
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

export const normalizePiAgentMessages = ({
  messages,
  completionTools = []
}: {
  messages: AgentMessage[];
  completionTools?: ChatCompletionTool[];
}): AgentMessage[] =>
  messages.map((message) => {
    if (!isAssistantMessage(message)) return message;

    const normalizedMessage: AssistantMessage = {
      ...message,
      content: [...message.content]
    };
    normalizeAssistantToolCalls({
      message: normalizedMessage,
      completionTools
    });

    return normalizedMessage;
  });

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
  appendPendingAgentError: (error: unknown) => void;
  onPayload: (payload: unknown, model: Model<any>) => undefined;
  handleAgentEvent: (event: AgentEvent) => void;
};

export const createPiAgentWorkflowRuntime = ({
  props,
  nodeResponses,
  workflowStreamResponse,
  usagePush,
  completionTools,
  saveLLMRequestRecordFn = saveLLMRequestRecord
}: {
  props: DispatchAgentModuleProps;
  nodeResponses: ChatHistoryItemResType[];
  workflowStreamResponse?: WorkflowResponseType;
  usagePush: DispatchAgentModuleProps['usagePush'];
  completionTools?: ChatCompletionTool[];
  saveLLMRequestRecordFn?: typeof saveLLMRequestRecord;
}): PiAgentWorkflowRuntimeArtifacts => {
  const modelData = getLLMModel(props.params.model);
  const showReasoning = props.params.aiChatReasoning !== false;
  const pendingRequests: PendingRequest[] = [];
  let requestIndex = 0;
  let answerText = '';
  let reasoningText = '';
  const usedUserOpenAIKey = !!props.externalProvider.openaiAccount?.key;

  const appendChildNodeResponse = (nodeResponse: ChatHistoryItemResType) => {
    nodeResponses.push(nodeResponse);
  };

  const saveRequestRecord = ({
    request,
    response
  }: {
    request: PendingRequest;
    response: Record<string, unknown>;
  }) => {
    void saveLLMRequestRecordFn({
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
    const totalPoints = usedUserOpenAIKey
      ? 0
      : formatModelChars2Points({
          model: modelData,
          inputTokens,
          outputTokens
        }).totalPoints;
    const finishReason = mapStopReason(message.stopReason);
    const errorText =
      message.errorMessage ||
      (finishReason === 'error' ? completionFinishReasonMap.error : undefined);
    const seconds = +((Date.now() - request.startTime) / 1000).toFixed(2);

    const usage: ChatNodeUsageType = {
      moduleName: AgentUsageModuleName.agentCall,
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
        ...(message.responseId ? { providerResponseId: message.responseId } : {}),
        ...(errorText && { error: errorText })
      }
    });

    const agentResponse: ChatHistoryItemResType = {
      id: `${props.node.nodeId}-${request.requestIndex}-${request.requestId}`,
      nodeId: `${props.node.nodeId}-pi-${request.requestIndex}`,
      moduleName: AgentNodeResponseDisplay.piMaster.moduleName,
      moduleType: props.node.flowNodeType,
      moduleLogo: AgentNodeResponseDisplay.piMaster.moduleLogo,
      runningTime: seconds,
      model: request.modelName || modelData.name,
      llmRequestIds: [request.requestId],
      inputTokens,
      outputTokens,
      totalPoints,
      finishReason,
      textOutput: answerText,
      ...(showReasoning && reasoningText ? { reasoningText } : {}),
      ...(errorText ? { errorText: getErrText(errorText) } : {})
    };

    nodeResponses.push(agentResponse);
  };

  return {
    getAnswerText: () => answerText,
    getReasoningText: () => reasoningText,
    appendChildNodeResponse,
    appendPendingAgentError: (error) => {
      const request = pendingRequests.shift();
      if (!request) return;

      appendAgentNodeResponse({
        request,
        message: {
          role: 'assistant',
          content: [],
          stopReason: 'error',
          errorMessage: getErrText(error)
        } as unknown as AssistantMessage,
        answerText: '',
        reasoningText: '',
        toolCalls: []
      });
    },
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
          if (showReasoning) {
            workflowStreamResponse?.({
              event: SseResponseEventEnum.answer,
              data: textAdaptGptResponse({ reasoning_content: assistantEvent.delta })
            });
          }
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
        normalizeAssistantToolCalls({
          message: event.message,
          completionTools
        });
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
