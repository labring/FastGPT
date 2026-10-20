import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import type { AgentLoopCoreToolDisplayInfo } from '../../domain/toolInfo';

export type CreateAgentLoopCoreEventStreamParams = {
  workflowStreamResponse?: WorkflowResponseType;
  streamAnswer?: boolean;
  streamReasoning?: boolean;
  sliceToolResponse?: boolean;
  getToolInfo: (name: string) => AgentLoopCoreToolDisplayInfo | undefined;
};

export type AgentLoopCoreEventStream = {
  /** 标记后续 assistant 文本开始新的展示块。 */
  startNewAnswerBlock: () => void;
  streamReasoning: (text: string) => void;
  streamAnswer: (text: string) => void;
  streamToolCall: (call: ChatCompletionMessageToolCall) => void;
  streamToolParams: (args: { callId: string; argsDelta: string }) => void;
  streamToolResponse: (args: { toolCallId: string; response?: string }) => void;
  streamPlanStatus: (status: 'generating' | 'updating') => void;
  streamPlan: (plan: unknown) => void;
  streamFlowNodeStatus: (args: { status: 'running'; name: string }) => void;
};
