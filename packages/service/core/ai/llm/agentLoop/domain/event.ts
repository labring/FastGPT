import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { AgentAskPayload } from './systemTool/ask';
import type { AgentLoopUsage } from './usage';

export type AgentLoopToolResponseCompress = {
  response: string;
  usage: AgentLoopUsage;
  requestIds: string[];
  seconds: number;
};

type AgentLoopPlanOperationEvent = {
  type: 'plan_operation';
  operation: 'set_plan' | 'add_steps' | 'update_steps';
  message: string;
  id?: string;
  params?: string;
  seconds?: number;
} & (
  | {
      success: true;
      plan: AgentPlanType;
      error?: never;
    }
  | {
      success: false;
      plan?: never;
      error?: unknown;
    }
);

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
      finishReason: CompletionFinishReason;
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
      /** 工具内部产生、需要随本轮 assistant 一起持久化的标准消息。 */
      assistantMessages?: ChatCompletionMessageParam[];
      errorMessage?: string;
      seconds: number;
      usages?: AgentLoopUsage[];
      toolResponseCompress?: AgentLoopToolResponseCompress;
      /** executeTool 返回的 opaque metadata，agent-loop 不解释其业务结构。 */
      metadata?: unknown;
    }
  | {
      type: 'after_message_compress';
      usages?: AgentLoopUsage[];
      requestIds: string[];
      seconds: number;
      contextCheckpoint?: string;
    }
  | {
      type: 'plan_status';
      status: 'generating' | 'updating';
    }
  | AgentLoopPlanOperationEvent
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
    };
