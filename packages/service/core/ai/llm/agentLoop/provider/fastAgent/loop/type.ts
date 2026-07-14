import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  CompletionFinishReason
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentPlanType } from '@fastgpt/global/core/ai/agent/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { CreateLLMResponseProps } from '../../../../request';
import type { SandboxClient } from '../../../../../sandbox/interface/runtime';
import type { AgentLoopToolCatalog } from '../tools';
import type { AgentLoopDatasetSearchExecutor } from '../../../domain/systemTool/datasetSearch';
import type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopEvent,
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopPause,
  AgentLoopReadFileExecutor,
  AgentLoopToolExecutionResult,
  AgentLoopUsage
} from '../../../domain';

export type {
  AgentLoopChildrenInteractiveParams,
  AgentLoopEvent,
  AgentLoopInteractiveToolExecuteParams,
  AgentLoopPause,
  AgentLoopToolExecutionResult,
  AgentLoopUsage
};

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  teamId: string;
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
    e: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  sandboxToolContext?: {
    client: SandboxClient;
  };
  executeReadFileTool?: AgentLoopReadFileExecutor;
  executeDatasetSearchTool?: AgentLoopDatasetSearchExecutor;
  datasetSearchCurrentInputFiles?: string[];
  usagePush?: (usages: AgentLoopUsage[]) => void;
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
