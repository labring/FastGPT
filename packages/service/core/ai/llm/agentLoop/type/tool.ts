import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import type { ChatNodeUsageType } from '@fastgpt/global/support/wallet/bill/type';
import type { SandboxClient } from '../../../sandbox/service/runtime';

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
  usages: ChatNodeUsageType[];
  interactive?: TChildrenResponse;
  stop?: boolean;
  skipResponseCompress?: boolean;
  errorMessage?: string;
  nodeResponse?: ChatHistoryItemResType;
};

export type AgentLoopReadFileExecutionResult = {
  response: string;
  usages: ChatNodeUsageType[];
  nodeResponse?: ChatHistoryItemResType;
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
};
