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

export type AgentLoopLLMParams = {
  model: string;
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
  teamId: string;
  llmParams: AgentLoopLLMParams;
  responseParams?: AgentLoopResponseParams;
  lang?: localeType;
  systemTools?: AgentLoopSystemTools;
  maxRunAgentTimes?: number;
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

/**
 * 判断 Agent 是否拥有能执行实际业务动作的工具。
 * ask/plan 只负责交互和状态维护，不应让主提示词误认为可以执行外部任务。
 */
export const hasAgentLoopExecutableTools = ({
  toolCatalog,
  systemTools
}: Pick<AgentLoopRuntime, 'toolCatalog' | 'systemTools'>) =>
  toolCatalog.runtimeTools.length > 0 ||
  systemTools?.sandbox?.enabled === true ||
  systemTools?.readFile?.enabled === true ||
  systemTools?.datasetSearch?.enabled === true;
