import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { ContextCheckpointValueType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { CreateLLMResponseProps } from '../../../../request';
import type { SandboxClient } from '../../../../../sandbox/service/runtime';
import type { AgentLoopToolCatalog } from '../tools';
import type { AgentAskPayload } from '../../../systemTools/ask';
import type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopEvent,
  AgentLoopReadFileExecutor,
  AgentLoopToolChildrenInteractive,
  AgentLoopToolExecutionResult
} from '../../../type';

export type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopEvent,
  AgentLoopToolChildrenInteractive,
  AgentLoopToolExecutionResult
};

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  model: string;
  promptMode?: 'fastAgent' | 'raw';
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: CreateLLMResponseProps['userKey'];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: CreateLLMResponseProps['body']['stop'];
  responseFormat?: CreateLLMResponseProps['body']['response_format'];
  retainDatasetCite?: CreateLLMResponseProps['body']['retainDatasetCite'];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
  lang?: localeType;
  maxRunAgentTimes?: number;
  batchToolSize?: number;
  maxStopGateRejections?: number;
  checkIsStopping?: () => boolean;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  executeInteractiveTool?: (
    e: AgentLoopChildrenInteractiveParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  sandboxToolContext?: {
    client: SandboxClient;
  };
  executeReadFileTool?: AgentLoopReadFileExecutor;
  usagePush?: (usages: ChatNodeUsageType[]) => void;
  emitEvent?: (event: AgentLoopEvent) => void;
};

export type PendingMainContext = {
  messages: ChatCompletionMessageParam[];
  askToolCallId: string;
  activePlan?: AgentPlanType;
  requirePlan?: boolean;
  runtimeToolCalledSinceLastPlanUpdate?: boolean;
};

export type FastAgentLoopInput<TChildrenResponse = unknown> = {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  userAnswer?: string;
  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
};

export type FastAgentLoopResult<TChildrenResponse = unknown> = {
  status: 'done' | 'ask' | 'aborted' | 'error';
  answerText?: string;
  reasoningText?: string;
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  ask?: AgentAskPayload;
  askId?: string;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  interactiveResponse?: AgentLoopToolChildrenInteractive<TChildrenResponse>;
  inputTokens?: number;
  outputTokens?: number;
  llmTotalPoints?: number;
  finishReason?: CompletionFinishReason;
  requestIds: string[];
  contextCheckpoint?: ContextCheckpointValueType;
  error?: unknown;
};
