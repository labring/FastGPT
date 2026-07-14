import {
  normalizeAgentLoopUsages,
  type AgentLoopEvent
} from '../../../../../../ai/llm/agentLoop/interface';
import type { AgentLoopCoreEventStream } from './type';
import type { createAgentLoopCoreToolRunResponseCollector } from '../nodeResponse';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';

type ToolRunCollector = ReturnType<typeof createAgentLoopCoreToolRunResponseCollector>;

const readToolNodeResponse = (metadata: unknown): ChatHistoryItemResType | undefined =>
  metadata && typeof metadata === 'object' ? (metadata as ChatHistoryItemResType) : undefined;

export type CreateAgentLoopCoreEventDispatcherParams = {
  eventStream: AgentLoopCoreEventStream;
  toolRunCollector?: Pick<
    ToolRunCollector,
    'appendContextCompressNodeResponse' | 'appendToolNodeResponse'
  >;
  shouldStreamTool?: (name: string) => boolean;
};

/**
 * 创建 agent-loop event 的 workflow 侧共享分发器。
 *
 * 这里只做通用事件路由：SSE 由 eventStream 处理，工具运行详情由 toolRunCollector 处理。
 * assistantResponses/nodeResponses 等持久化 collector 仍由调用方按需要单独挂载。
 */
export const createAgentLoopCoreEventDispatcher = ({
  eventStream,
  toolRunCollector,
  shouldStreamTool = () => true
}: CreateAgentLoopCoreEventDispatcherParams) => {
  const pendingToolCallMap = new Map<
    string,
    Extract<AgentLoopEvent, { type: 'tool_call' }>['call']
  >();
  const completedToolCallIds = new Set<string>();

  const emitEvent = (event: AgentLoopEvent) => {
    switch (event.type) {
      case 'after_message_compress': {
        const [usage] = normalizeAgentLoopUsages(event.usages);
        if (!usage) return;
        toolRunCollector?.appendContextCompressNodeResponse({
          usage,
          requestIds: event.requestIds,
          contextCheckpoint: event.contextCheckpoint,
          seconds: event.seconds
        });
        return;
      }
      case 'reasoning_delta':
        eventStream.streamReasoning(event.text);
        return;
      case 'answer_delta':
        eventStream.streamAnswer(event.text);
        return;
      case 'llm_request_start':
        eventStream.streamFlowNodeStatus({
          status: 'running',
          name: event.modelName
        });
        return;
      case 'tool_call': {
        const functionName = event.call.function.name;
        if (!shouldStreamTool(functionName)) return;
        pendingToolCallMap.set(event.call.id, event.call);
        eventStream.streamToolCall(event.call);
        return;
      }
      case 'tool_params': {
        const call = pendingToolCallMap.get(event.callId);
        if (!call || !shouldStreamTool(call.function.name)) return;
        eventStream.streamToolParams({
          callId: event.callId,
          argsDelta: event.argsDelta
        });
        return;
      }
      case 'tool_run_end': {
        if (completedToolCallIds.has(event.call.id)) return;
        completedToolCallIds.add(event.call.id);

        const functionName = event.call.function.name;
        if (!event.errorMessage && shouldStreamTool(functionName)) {
          eventStream.streamToolResponse({
            toolCallId: event.call.id,
            response: event.response
          });
        }
        toolRunCollector?.appendToolNodeResponse({
          call: event.call,
          response: event.response,
          errorMessage: event.errorMessage,
          seconds: event.seconds,
          usages: event.usages,
          nodeResponse: readToolNodeResponse(event.metadata),
          toolResponseCompress: event.toolResponseCompress
        });
        return;
      }
      case 'plan_status':
        eventStream.streamPlanStatus(event.status);
        return;
      case 'plan_operation':
        if (event.success) {
          eventStream.streamPlan(event.plan);
        }
        return;
      case 'llm_request_end':
      case 'ask_start':
      case 'ask':
      case 'ask_resume':
        return;
    }
  };

  return {
    emitEvent
  };
};
