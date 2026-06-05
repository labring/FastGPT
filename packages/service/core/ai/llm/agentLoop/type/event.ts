import type {
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType,
  ContextCheckpointValueType
} from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { AgentAskPayload } from '../systemTools/ask';

export type AgentLoopUsage = ChatNodeUsageType;

export const normalizeAgentLoopUsages = (usages?: Array<AgentLoopUsage | undefined>) =>
  usages?.filter((usage): usage is AgentLoopUsage => !!usage) ?? [];

export type AgentLoopToolResponseCompress = {
  response: string;
  usage: AgentLoopUsage;
  requestIds: string[];
  seconds: number;
};

export type AgentLoopEvent =
  | {
      type: 'llm_request_start';
      requestIndex: number;
      modelName: string;
    }
  | {
      type: 'llm_request_end';
      requestIndex: number;
      modelName: string;
      requestId: string;
      finishReason?: CompletionFinishReason;
      answerText?: string;
      reasoningText?: string;
      toolCalls?: ChatCompletionMessageToolCall[];
      usages?: AgentLoopUsage[];
      seconds: number;
      error?: unknown;
    }
  | {
      type: 'reasoning_delta';
      text: string;
    }
  | {
      type: 'answer_delta';
      text: string;
    }
  | {
      type: 'tool_call';
      call: ChatCompletionMessageToolCall;
    }
  | {
      type: 'tool_params';
      callId: string;
      argsDelta: string;
    }
  | {
      type: 'tool_run_start';
      call: ChatCompletionMessageToolCall;
    }
  | {
      type: 'tool_run_end';
      call: ChatCompletionMessageToolCall;
      rawResponse: string;
      response: string;
      errorMessage?: string;
      seconds: number;
      usages?: AgentLoopUsage[];
      toolResponseCompress?: AgentLoopToolResponseCompress;
      nodeResponse?: ChatHistoryItemResType;
    }
  | {
      type: 'after_message_compress';
      usages?: AgentLoopUsage[];
      requestIds: string[];
      seconds: number;
      contextCheckpoint?: ContextCheckpointValueType;
    }
  | {
      type: 'plan_status';
      status: 'generating' | 'updating';
    }
  | {
      type: 'plan_update';
      plan: AgentPlanType;
    }
  | {
      type: 'plan_operation';
      operation: 'set_plan' | 'add_steps' | 'update_steps';
      success: boolean;
      message: string;
      id?: string;
      params?: string;
      seconds?: number;
      plan?: AgentPlanType;
      error?: unknown;
    }
  | {
      type: 'ask_start';
      ask: AgentAskPayload;
      id?: string;
      params?: string;
      seconds?: number;
    }
  | {
      type: 'ask';
      ask: AgentAskPayload;
      providerState?: unknown;
    }
  | {
      type: 'ask_resume';
      answer: string;
    }
  | {
      type: 'assistant_push';
      value: AIChatItemValueItemType;
    };
