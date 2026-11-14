import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/llm/type';
import type { localeType } from '@fastgpt/global/common/i18n/type';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { FileClassificationContext } from '../../../../../common/file/classification';
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
 * answerText 是本次结束时模型给出的最终正文，供业务层做语义完成检查；
 * 业务层不得据此做关键词匹配，交付、取消等客观状态仍以自身工具事实为准。
 */
export type AgentLoopCompletionPolicy = (context: {
  requestIndex: number;
  answerText: string;
}) => AgentLoopCompletionDecision | Promise<AgentLoopCompletionDecision>;

export type AgentLoopRuntime<TChildrenResponse = unknown> = {
  teamId: string;
  llmParams: AgentLoopLLMParams;
  fileContext?: FileClassificationContext;
  responseParams?: AgentLoopResponseParams;
  lang?: localeType;
  systemTools?: AgentLoopSystemTools;
  maxRunAgentTimes?: number;
  completionPolicy?: AgentLoopCompletionPolicy;
  /** 真正压缩时读取业务恢复入口，结果随 checkpoint 固化。 */
  getCheckpointContext?: () => Promise<string>;
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
  /** 可信服务端持久化事件，不受对外展示裁剪影响。 */
  recordEvent?: (event: AgentLoopEvent) => void;
};
