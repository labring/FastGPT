import { sliceStrStartEnd } from '@fastgpt/global/common/string/tools';
import { SseResponseEventEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { textAdaptGptResponse } from '@fastgpt/global/core/workflow/runtime/utils';
import type { AgentLoopCoreEventStream, CreateAgentLoopCoreEventStreamParams } from './type';

const AGENT_PLAN_STREAM_RESPONSE_ID = 'agent-plan-stream';

/**
 * 创建 agent-loop 到 workflow SSE 的共享流式适配器。
 *
 * 这里只负责前端实时事件，不维护 assistantResponses 或 nodeResponses。
 * ToolCall 通过 streamAnswer 开关控制是否把模型内容作为聊天回答输出；
 * Workflow Agent 通常始终开启 answer，只用 streamReasoning 控制思考过程展示。
 */
export const createAgentLoopCoreEventStream = ({
  workflowStreamResponse,
  streamAnswer = true,
  streamReasoning = true,
  sliceToolResponse = false,
  getToolInfo
}: CreateAgentLoopCoreEventStreamParams): AgentLoopCoreEventStream => {
  const streamReasoningText = (text: string) => {
    if (!streamReasoning) return;
    workflowStreamResponse?.({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        reasoning_content: text
      })
    });
  };

  const streamAnswerText = (text: string) => {
    if (!streamAnswer) return;
    workflowStreamResponse?.({
      event: SseResponseEventEnum.answer,
      data: textAdaptGptResponse({
        text
      })
    });
  };

  const streamToolCall: AgentLoopCoreEventStream['streamToolCall'] = (call) => {
    if (!streamAnswer) return;

    const toolInfo = getToolInfo(call.function.name);
    if (!toolInfo) return;

    workflowStreamResponse?.({
      id: call.id,
      event: SseResponseEventEnum.toolCall,
      data: {
        tool: {
          id: call.id,
          toolName: toolInfo.name,
          toolAvatar: toolInfo.avatar || '',
          functionName: call.function.name,
          params: call.function.arguments ?? ''
        }
      }
    });
  };

  const streamToolParams: AgentLoopCoreEventStream['streamToolParams'] = ({
    callId,
    argsDelta
  }) => {
    if (!streamAnswer) return;

    workflowStreamResponse?.({
      id: callId,
      event: SseResponseEventEnum.toolParams,
      data: {
        tool: {
          id: callId,
          toolName: '',
          toolAvatar: '',
          params: argsDelta
        }
      }
    });
  };

  const streamToolResponse: AgentLoopCoreEventStream['streamToolResponse'] = ({
    toolCallId,
    response
  }) => {
    if (!streamAnswer) return;

    workflowStreamResponse?.({
      id: toolCallId,
      event: SseResponseEventEnum.toolResponse,
      data: {
        tool: {
          id: toolCallId,
          toolName: '',
          toolAvatar: '',
          params: '',
          response: sliceToolResponse
            ? sliceStrStartEnd(response || '', 5000, 5000)
            : response || ''
        }
      }
    });
  };

  const streamPlanStatus: AgentLoopCoreEventStream['streamPlanStatus'] = (status) => {
    workflowStreamResponse?.({
      id: AGENT_PLAN_STREAM_RESPONSE_ID,
      event: SseResponseEventEnum.planStatus,
      data: {
        planStatus: {
          status
        }
      }
    });
  };

  const streamPlan: AgentLoopCoreEventStream['streamPlan'] = (plan) => {
    workflowStreamResponse?.({
      id: AGENT_PLAN_STREAM_RESPONSE_ID,
      event: SseResponseEventEnum.plan,
      data: {
        plan
      }
    });
  };

  const streamFlowNodeStatus: AgentLoopCoreEventStream['streamFlowNodeStatus'] = ({
    status,
    name
  }) => {
    workflowStreamResponse?.({
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status,
        name
      }
    });
  };

  return {
    streamReasoning: streamReasoningText,
    streamAnswer: streamAnswerText,
    streamToolCall,
    streamToolParams,
    streamToolResponse,
    streamPlanStatus,
    streamPlan,
    streamFlowNodeStatus
  };
};
