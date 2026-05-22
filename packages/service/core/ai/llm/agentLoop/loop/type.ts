import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { ContextCheckpointValueType } from '@fastgpt/global/core/chat/type';
import type { CreateLLMResponseProps } from '../../request';
import type { AgentLoopToolCatalog } from '../tools';
import type { PlanAskPayload } from '../plan/askTool';

// agentLoop 位于 LLM 底层，不直接依赖 workflow 的交互 schema。
// 调用方可通过泛型把 childrenResponse 收敛成自己的固定类型，例如 workflow 使用
// WorkflowInteractiveResponseType。
export type AgentLoopChildrenInteractiveParams<TChildrenResponse = unknown> = {
  childrenResponse: TChildrenResponse;
  toolParams: {
    memoryRequestMessages: ChatCompletionMessageParam[];
    toolCallId: string;
  };
};

export type AgentLoopToolChildrenInteractive<TChildrenResponse = unknown> = {
  type: 'toolChildrenInteractive';
  params: {
    childrenResponse: TChildrenResponse;
    toolParams: {
      memoryRequestMessages: ChatCompletionMessageParam[];
      toolCallId: string;
    };
  };
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
      usage?: {
        inputTokens: number;
        outputTokens: number;
        totalPoints: number;
      };
      seconds: number;
      error?: unknown;
    }
  | { type: 'reasoning_delta'; text: string }
  | { type: 'answer_delta'; text: string }
  | { type: 'tool_call'; call: ChatCompletionMessageToolCall }
  | { type: 'tool_params'; callId: string; argsDelta: string }
  | {
      type: 'tool_response';
      call: ChatCompletionMessageToolCall;
      response: string;
      seconds: number;
      toolResponseCompress?: {
        response: string;
        usage: ChatNodeUsageType;
        requestIds: string[];
        seconds: number;
      };
    }
  | {
      type: 'stop_gate_feedback';
      id: string;
      reason: string;
      feedback: string;
      assistantText?: string;
      reasoningText?: string;
    }
  | {
      type: 'after_message_compress';
      usage?: ChatNodeUsageType;
      requestIds: string[];
      seconds: number;
      contextCheckpoint?: ContextCheckpointValueType;
    }
  | { type: 'plan_status'; status: 'generating' | 'updating' }
  | { type: 'plan_update'; plan: AgentPlanType };

export type AgentLoopToolExecutionResult<TChildrenResponse = unknown> = {
  response: string;
  assistantMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  interactive?: TChildrenResponse;
  stop?: boolean;
  skipResponseCompress?: boolean;
};

export type AgentLoopRuntime = {
  model: string;
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: CreateLLMResponseProps['userKey'];
  stream?: boolean;
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
  maxRunAgentTimes?: number;
  batchToolSize?: number;
  maxStopGateRejections?: number;
  checkIsStopping?: () => boolean;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<AgentLoopToolExecutionResult>;
  emitEvent?: (event: AgentLoopEvent) => void;
  usageSink?: (usages: ChatNodeUsageType[]) => void;
};

export type PendingMainContext = {
  messages: ChatCompletionMessageParam[];
  askToolCallId: string;
  activePlan?: AgentPlanType;
  requirePlan?: boolean;
  runtimeToolCalledSinceLastPlanUpdate?: boolean;
};

export type UnifiedAgentLoopInput = {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  userAnswer?: string;
};

export type UnifiedAgentLoopResult = {
  status: 'done' | 'ask' | 'aborted' | 'error';
  answerText?: string;
  reasoningText?: string;
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  ask?: PlanAskPayload;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  requestIds: string[];
  contextCheckpoint?: ContextCheckpointValueType;
  error?: unknown;
};
