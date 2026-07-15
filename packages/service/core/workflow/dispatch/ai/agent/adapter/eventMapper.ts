import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { streamSseEvent } from '@fastgpt/global/core/chat/stream/sse';
import { createAgentLoopEventResponseReducer } from '../../../../../ai/llm/agentLoop';
import type { StreamResponseType } from '../../../type';
import type { GetSubAppInfoFnType } from '../type';

const AGENT_PLAN_STREAM_RESPONSE_ID = 'agent-plan-stream';

/**
 * 将通用 Agent Loop 事件适配为 workflow SSE。
 * 可持久化聊天状态由共享 reducer 维护，本层只提供 workflow 工具展示和流式协议。
 */
export const createWorkflowAgentLoopEventMapper = ({
  workflowStreamResponse,
  getSubAppInfo,
  internalToolNames,
  updatePlanToolName,
  askToolName,
  showReasoning = true,
  assistantResponses = []
}: {
  workflowStreamResponse?: StreamResponseType;
  getSubAppInfo: GetSubAppInfoFnType;
  internalToolNames: Set<string>;
  updatePlanToolName?: string;
  askToolName?: string;
  showReasoning?: boolean;
  assistantResponses?: AIChatItemValueItemType[];
}) =>
  createAgentLoopEventResponseReducer({
    assistantResponses,
    updatePlanToolName,
    askToolName,
    showReasoning,
    isRuntimeTool: (functionName) => !internalToolNames.has(functionName),
    createRuntimeTool: (event) => {
      const functionName = event.call.function.name;
      const subApp = getSubAppInfo(functionName);
      return {
        id: event.call.id,
        toolName: subApp?.name ?? functionName,
        toolAvatar: subApp?.avatar ?? '',
        functionName,
        params: event.call.function.arguments ?? ''
      };
    },
    callbacks: {
      onAnswerDelta: (event) => {
        workflowStreamResponse?.(streamSseEvent.answerDelta(event.text));
      },
      onReasoningDelta: (event) => {
        workflowStreamResponse?.(streamSseEvent.reasoningDelta(event.text));
      },
      onLlmRequestStart: (event) => {
        workflowStreamResponse?.(streamSseEvent.flowNodeStatus(event.modelName));
      },
      onRuntimeToolCall: ({ tool }) => {
        workflowStreamResponse?.(streamSseEvent.toolCall(tool));
      },
      onRuntimeToolParams: (event) => {
        workflowStreamResponse?.(
          streamSseEvent.toolParams({ id: event.callId, params: event.argsDelta })
        );
      },
      onRuntimeToolResponse: (event) => {
        workflowStreamResponse?.(
          streamSseEvent.toolResponse({ id: event.call.id, response: event.response })
        );
      },
      onPlanStatus: (event) => {
        workflowStreamResponse?.(
          streamSseEvent.planStatus({ status: event.status }, AGENT_PLAN_STREAM_RESPONSE_ID)
        );
      },
      onPlanUpdate: (event) => {
        workflowStreamResponse?.(streamSseEvent.plan(event.plan, AGENT_PLAN_STREAM_RESPONSE_ID));
      }
    }
  });
