import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { AIChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import type { SandboxClient } from '../../../sandbox/interface/runtime';
import type { AgentLoopDatasetSearchExecutor } from './systemTool/datasetSearch';
import type { AgentLoopUsage } from './usage';

export type AgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  batchToolSize?: number;
};

/**
 * 工具内部产生的可持久化 assistant 展示项。
 *
 * agent-loop 不解释这些字段，只负责沿工具执行结果和标准事件链路透传；
 * workflow adapter 负责按顺序合并到最终 assistantResponses。
 */
export type AgentLoopAssistantResponse = AIChatItemValueItemType;

export type AgentLoopToolExecuteParams = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
};

export type AgentLoopReadFileExecuteParams = {
  call: ChatCompletionMessageToolCall;
  messages: ChatCompletionMessageParam[];
};

export type AgentLoopToolExecutionResult<TChildrenResponse = unknown> = {
  response: string;
  assistantMessages: ChatCompletionMessageParam[];
  /** 工具内部产生的展示层 assistant responses，由上层 adapter 解释。 */
  assistantResponses?: AgentLoopAssistantResponse[];
  usages: AgentLoopUsage[];
  interactive?: TChildrenResponse;
  stop?: boolean;
  skipResponseCompress?: boolean;
  errorMessage?: string;
  /** 由调用方透传并在 agent-loop 外部解释的工具运行元数据。 */
  metadata?: unknown;
};

export type AgentLoopReadFileExecutionResult = {
  response: string;
  usages: AgentLoopUsage[];
  metadata?: unknown;
  error?: unknown;
};

export type AgentLoopReadFileExecutor = (
  params: AgentLoopReadFileExecuteParams
) => Promise<AgentLoopReadFileExecutionResult>;

export type AgentLoopSystemTools = {
  plan?: {
    enabled: boolean;
  };
  ask?: {
    enabled: boolean;
  };
  sandbox?: {
    enabled: boolean;
    client: SandboxClient;
  };
  readFile?: {
    enabled: boolean;
    maxFileAmount: number;
    execute: AgentLoopReadFileExecutor;
  };
  datasetSearch?: {
    enabled: boolean;
    execute: AgentLoopDatasetSearchExecutor;
    currentInputFiles?: string[];
  };
};
