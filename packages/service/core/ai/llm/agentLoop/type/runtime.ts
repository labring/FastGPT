import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/llm/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { CreateLLMResponseProps } from '../../request';
import type { AgentLoopEvent } from './event';
import type { AgentLoopChildrenInteractiveParams } from './interactive';
import type {
  AgentLoopSystemTools,
  AgentLoopToolCatalog,
  AgentLoopToolExecuteParams,
  AgentLoopToolExecutionResult
} from './tool';

export type AgentLoopLLMParams = {
  model: string;
  promptMode?: 'fastAgent' | 'raw';
  reasoningEffort?: CreateLLMResponseProps['body']['reasoning_effort'];
  userKey?: OpenaiAccountType;
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  stop?: string;
  responseFormat?: CreateLLMResponseProps<ChatCompletionCreateParams>['body']['response_format'];
  useVision?: boolean;
  useAudio?: boolean;
  useVideo?: boolean;
  extractFiles?: boolean;
};

export type AgentLoopResponseParams = {
  retainDatasetCite?: boolean;
};

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  llmParams: AgentLoopLLMParams;
  responseParams?: AgentLoopResponseParams;
  lang?: localeType;
  systemTools?: AgentLoopSystemTools;
  maxRunAgentTimes?: number;
  maxStopGateRejections?: number;
  checkIsStopping?: () => boolean;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (
    params: AgentLoopToolExecuteParams
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  executeInteractiveTool?: (
    params: AgentLoopChildrenInteractiveParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  usagePush?: (usages: ChatNodeUsageType[]) => void;
  emitEvent?: (event: AgentLoopEvent) => void;
};
