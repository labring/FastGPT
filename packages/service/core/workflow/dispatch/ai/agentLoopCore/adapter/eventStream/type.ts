import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import type { WorkflowResponseType } from '../../../../type';

export type AgentLoopCoreStreamToolInfo = {
  name: string;
  avatar?: string;
};

export type CreateAgentLoopCoreEventStreamParams = {
  workflowStreamResponse?: WorkflowResponseType;
  streamAnswer?: boolean;
  streamReasoning?: boolean;
  sliceToolResponse?: boolean;
  getToolInfo: (name: string) => AgentLoopCoreStreamToolInfo | undefined;
};

export type AgentLoopCoreEventStream = {
  streamReasoning: (text: string) => void;
  streamAnswer: (text: string) => void;
  streamToolCall: (call: ChatCompletionMessageToolCall) => void;
  streamToolParams: (args: { callId: string; argsDelta: string }) => void;
  streamToolResponse: (args: { toolCallId: string; response?: string }) => void;
  streamPlanStatus: (status: 'generating' | 'updating') => void;
  streamPlan: (plan: unknown) => void;
  streamFlowNodeStatus: (args: { status: 'running'; name: string }) => void;
};
