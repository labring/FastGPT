import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { CreateLLMResponseProps } from '../../../../request';
import type { AgentLoopToolCatalog } from '../tools';
import type { AgentLoopDatasetSearchExecutor } from '../../../domain/systemTool/datasetSearch';
import type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopCompletionPolicy,
  AgentLoopAskValidator,
  AgentLoopEvent,
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopPendingMainContext,
  AgentLoopPause,
  AgentLoopReadFileExecutor,
  AgentLoopSystemPromptBuilder,
  AgentLoopToolExecutionResult,
  AgentLoopSandboxExecutor,
  AgentLoopUsage
} from '../../../domain';

export type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopCompletionPolicy,
  AgentLoopEvent,
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopPause,
  AgentLoopToolExecutionResult,
  AgentLoopUsage
};

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  teamId: string;
  model: string;
  systemPromptBuilder?: AgentLoopSystemPromptBuilder;
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
  forceMediaToBase64?: boolean;
  extractFiles?: boolean;
  lang?: localeType;
  hasExecutableTools: boolean;
  maxRunAgentTimes?: number;
  completionPolicy?: AgentLoopCompletionPolicy;
  batchToolSize?: number;
  checkIsStopping?: () => boolean;
  validateAsk?: AgentLoopAskValidator;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (e: {
    call: ChatCompletionMessageToolCall;
    messages: ChatCompletionMessageParam[];
  }) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  executeInteractiveTool?: (
    e: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  sandboxToolContext?: {
    client?: import('../../../../../sandbox/interface/runtime').SandboxClient;
    executor?: AgentLoopSandboxExecutor;
  };
  executeReadFileTool?: AgentLoopReadFileExecutor;
  executeDatasetSearchTool?: AgentLoopDatasetSearchExecutor;
  datasetSearchCurrentInputFiles?: string[];
  usagePush?: (usages: AgentLoopUsage[]) => void;
  emitEvent?: (event: AgentLoopEvent) => void;
};

export type PendingMainContext = AgentLoopPendingMainContext;

export type FastAgentLoopInput<TChildrenResponse = unknown> = {
  messages: ChatCompletionMessageParam[];
  systemPrompt?: string;
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  userAnswer?: string;
  childrenInteractiveParams?: AgentLoopChildrenInteractiveParams<TChildrenResponse>;
};

export type FastAgentLoopResultBase = {
  activePlan?: AgentPlanType;
  pendingMainContext?: PendingMainContext;
  completeMessages: ChatCompletionMessageParam[];
  assistantMessages: ChatCompletionMessageParam[];
  inputTokens?: number;
  outputTokens?: number;
  llmTotalPoints?: number;
  finishReason?: CompletionFinishReason;
  requestIds: string[];
  contextCheckpoint?: string;
};

export type FastAgentLoopResult<TChildrenResponse = unknown> =
  | (FastAgentLoopResultBase & {
      status: 'done';
      pause?: never;
      error?: never;
    })
  | (FastAgentLoopResultBase & {
      status: 'paused';
      pause: AgentLoopPause<TChildrenResponse>;
      error?: never;
    })
  | (FastAgentLoopResultBase & {
      status: 'aborted';
      pause?: never;
      error?: unknown;
    })
  | (FastAgentLoopResultBase & {
      status: 'error';
      pause?: never;
      error: unknown;
    });
