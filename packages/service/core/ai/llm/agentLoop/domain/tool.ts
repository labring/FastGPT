import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';
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
/**
 * Tool-generated assistant transcript kept opaque to the low-level agent loop.
 *
 * The workflow adapter owns the concrete chat value schema. Keeping this as an
 * object contract avoids coupling the model loop to workflow/chat modules while
 * still documenting that tool responses are structured assistant values.
 */
export type AgentLoopAssistantResponse = Record<string, unknown>;

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
  /**
   * 写入 LLM tool message 的结构化 content（text / image_url parts）。
   * 工具取到图片时可返回 image_url part，作为下一轮模型的视觉输入；缺省时按 response 字符串兜底。
   */
  content?: ChatCompletionToolMessageContentPart[];
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
