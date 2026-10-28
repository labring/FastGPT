import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/llm/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { CreateLLMResponseProps } from '../../request';
import type { AgentLoopEvent } from './event';
import type { AgentLoopInteractiveToolExecuteParams } from './interactive';
import type {
  AgentLoopSystemTools,
  AgentLoopToolCatalog,
  AgentLoopToolExecuteParams,
  AgentLoopToolExecutionResult
} from './tool';
import type { AgentLoopUsage } from './usage';
import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';

export type AgentLoopLLMParams = {
  model: LLMModelDataType;
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

export type AgentLoopCompletionDecision =
  | { action: 'complete' }
  | { action: 'continue'; message: string };

/**
 * 在模型自然结束且没有工具调用时，决定是否接受本次结束。
 * 策略只接收运行时事实，不接收模型文本，避免业务层通过关键词判断完成状态。
 */
export type AgentLoopCompletionPolicy = (context: {
  requestIndex: number;
}) => AgentLoopCompletionDecision | Promise<AgentLoopCompletionDecision>;

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  teamId: string;
  llmParams: AgentLoopLLMParams;
  responseParams?: AgentLoopResponseParams;
  lang?: localeType;
  systemTools?: AgentLoopSystemTools;
  maxRunAgentTimes?: number;
  completionPolicy?: AgentLoopCompletionPolicy;
  checkIsStopping?: () => boolean;
  toolCatalog: AgentLoopToolCatalog;
  executeTool: (
    params: AgentLoopToolExecuteParams
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  executeInteractiveTool?: (
    params: AgentLoopInteractiveToolExecuteParams<TChildrenResponse>
  ) => Promise<AgentLoopToolExecutionResult<TChildrenResponse>>;
  usagePush?: (usages: AgentLoopUsage[]) => void;
  emitEvent?: (event: AgentLoopEvent) => void;
};
