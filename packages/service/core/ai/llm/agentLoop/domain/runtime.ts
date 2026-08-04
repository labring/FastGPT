import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/llm/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { CreateLLMResponseProps } from '../../request';
import type { AgentLoopEvent } from './event';
import type { AgentLoopInteractiveToolExecuteParams } from './interactive';
import type { AgentLoopSystemPromptBuilder } from './mainPrompt';
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
  systemPromptBuilder?: AgentLoopSystemPromptBuilder;
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
