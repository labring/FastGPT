import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { SandboxClient } from '../../../sandbox/interface/runtime';
import type { AgentLoopDatasetSearchExecutor } from './systemTool/datasetSearch';
import type { AgentLoopUsage } from './usage';
import type { SandboxFileRef } from '@fastgpt/global/core/ai/sandbox/type';

export type AgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  batchToolSize?: number;
};

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
  usages: AgentLoopUsage[];
  interactive?: TChildrenResponse;
  stop?: boolean;
  skipResponseCompress?: boolean;
  errorMessage?: string;
  fileRefs?: SandboxFileRef[];
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
    execute: AgentLoopReadFileExecutor;
  };
  datasetSearch?: {
    enabled: boolean;
    execute: AgentLoopDatasetSearchExecutor;
    currentInputFiles?: string[];
  };
};
