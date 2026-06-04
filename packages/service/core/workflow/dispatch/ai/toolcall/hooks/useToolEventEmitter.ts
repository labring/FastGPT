import type { AgentLoopEvent } from '../../../../../ai/llm/agentLoop';
import { normalizeAgentLoopUsages } from '../../../../../ai/llm/agentLoop';

type StreamToolCall = (call: Extract<AgentLoopEvent, { type: 'tool_call' }>['call']) => void;
type StreamToolParams = (args: {
  call: Extract<AgentLoopEvent, { type: 'tool_call' }>['call'];
  argsDelta: string;
}) => void;

/**
 * 统一处理 agent-loop 事件到 ToolCall 侧流输出和运行详情的映射。
 * ToolCall 主流程只负责组装 runtime；事件的临时状态和分发细节收口在这里。
 */
export const useToolEventEmitter = ({
  streamReasoning,
  streamAnswer,
  streamToolCall,
  streamToolParams,
  streamToolResponse,
  appendToolNodeResponse,
  appendContextCompressNodeResponse
}: {
  streamReasoning: (text: string) => void;
  streamAnswer: (text: string) => void;
  streamToolCall: StreamToolCall;
  streamToolParams: StreamToolParams;
  streamToolResponse: (args: { toolCallId: string; response?: string }) => void;
  appendToolNodeResponse: (args: {
    call: Extract<AgentLoopEvent, { type: 'tool_run_end' }>['call'];
    response: string;
    errorMessage?: string;
    seconds: number;
    usages?: Extract<AgentLoopEvent, { type: 'tool_run_end' }>['usages'];
    nodeResponse?: Extract<AgentLoopEvent, { type: 'tool_run_end' }>['nodeResponse'];
    toolResponseCompress?: Extract<
      AgentLoopEvent,
      { type: 'tool_run_end' }
    >['toolResponseCompress'];
  }) => void;
  appendContextCompressNodeResponse: (args: {
    usage: NonNullable<Extract<AgentLoopEvent, { type: 'after_message_compress' }>['usages']>[0];
    requestIds: string[];
    seconds: number;
  }) => void;
}) => {
  const pendingToolCallMap = new Map<string, Parameters<StreamToolCall>[0]>();

  const emitEvent = (event: AgentLoopEvent) => {
    if (event.type === 'after_message_compress') {
      const [usage] = normalizeAgentLoopUsages(event.usages);
      if (!usage) return;
      appendContextCompressNodeResponse({
        usage,
        requestIds: event.requestIds,
        seconds: event.seconds
      });
      return;
    }

    if (event.type === 'reasoning_delta') {
      streamReasoning(event.text);
      return;
    }

    if (event.type === 'answer_delta') {
      streamAnswer(event.text);
      return;
    }

    if (event.type === 'tool_call') {
      pendingToolCallMap.set(event.call.id, event.call);
      streamToolCall(event.call);
      return;
    }

    if (event.type === 'tool_params') {
      const call = pendingToolCallMap.get(event.callId);
      if (!call) return;
      streamToolParams({
        call,
        argsDelta: event.argsDelta
      });
      return;
    }

    if (event.type === 'tool_run_end') {
      streamToolResponse({
        toolCallId: event.call.id,
        response: event.response
      });

      appendToolNodeResponse({
        call: event.call,
        response: event.response,
        errorMessage: event.errorMessage,
        seconds: event.seconds,
        usages: event.usages,
        nodeResponse: event.nodeResponse,
        toolResponseCompress: event.toolResponseCompress
      });
      return;
    }
  };

  return { emitEvent };
};
