import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { CreateLLMResponseProps } from '../../request';
import type { AgentLoopToolCatalog } from '../tools';
import type { PlanAskPayload } from '../plan/askTool';

export type AgentLoopProfileName = 'main_agent';

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
  | { type: 'profile_start'; profile: AgentLoopProfileName }
  | { type: 'profile_end'; profile: AgentLoopProfileName; requestIds: string[] }
  | {
      type: 'llm_request_start';
      profile: AgentLoopProfileName;
      requestIndex: number;
      modelName: string;
    }
  | {
      type: 'llm_request_end';
      profile: AgentLoopProfileName;
      requestIndex: number;
      modelName: string;
      agentName?: string;
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
      seconds?: number;
      error?: unknown;
    }
  | { type: 'reasoning_delta'; profile: AgentLoopProfileName; text: string }
  | { type: 'answer_delta'; profile: AgentLoopProfileName; text: string }
  | { type: 'tool_call'; profile: AgentLoopProfileName; call: ChatCompletionMessageToolCall }
  | { type: 'tool_params'; profile: AgentLoopProfileName; callId: string; argsDelta: string }
  | { type: 'tool_response'; profile: AgentLoopProfileName; callId: string; response: string }
  | {
      type: 'stop_gate_feedback';
      profile: AgentLoopProfileName;
      id: string;
      reason: string;
      feedback: string;
      assistantText?: string;
      reasoningText?: string;
    }
  | {
      type: 'child_llm_request_end';
      profile: AgentLoopProfileName;
      usage?: ChatNodeUsageType;
      requestIds: string[];
      seconds?: number;
    }
  | { type: 'plan_status'; status: 'generating' | 'updating' }
  | { type: 'plan_update'; plan: AgentPlanType }
  | { type: 'warning'; message: string };

export type AgentLoopToolExecutionResult<TChildrenResponse = unknown> = {
  response: string;
  assistantMessages: ChatCompletionMessageParam[];
  usages: ChatNodeUsageType[];
  interactive?: TChildrenResponse;
  stop?: boolean;
};

export type AgentLoopRuntime = {
  model: string;
  userKey?: CreateLLMResponseProps['userKey'];
  stream?: boolean;
  useVision?: boolean;
  maxRunAgentTimes?: number;
  maxStopGateRejections?: number;
  checkIsStopping?: () => boolean;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (e: {
    profile: AgentLoopProfileName;
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
  error?: unknown;
};
