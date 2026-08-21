import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopDatasetSearchExecutor } from './systemTool/datasetSearch';
import type { AgentAskPayload } from './systemTool/ask';
import type { AgentLoopUsage } from './usage';

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

/**
 * AgentLoop 使用的 Sandbox 工具执行边界。
 *
 * 默认 Agent 可以由适配层继续使用 SandboxClient；需要隔离工作目录的业务
 * （例如 Workflow Builder）应注入自己的执行器，避免把物理 Sandbox 直接交给模型。
 */
export type AgentLoopSandboxExecutionResult = {
  success: boolean;
  response: string;
  errorMessage?: string;
};

export type AgentLoopSandboxExecutor = (params: {
  toolName: string;
  args: string;
}) => Promise<AgentLoopSandboxExecutionResult>;

export type AgentLoopAskValidationContext = {
  /** 当前 ask_agent 工具调用所属 assistant 消息的正文。 */
  assistantContent: string;
};

export type AgentLoopAskValidator = (
  ask: AgentAskPayload,
  context: AgentLoopAskValidationContext
) => string | undefined | Promise<string | undefined>;

export type AgentLoopSystemTools = {
  plan?: {
    enabled: boolean;
  };
  ask?: {
    enabled: boolean;
    /** 由具体 Agent 注入交互约束；返回错误时将结果反馈给模型并继续当前 loop。 */
    validate?: AgentLoopAskValidator;
  };
  sandbox?: {
    enabled: boolean;
    /** 普通 Agent 的兼容入口。Workflow Builder 应优先使用 executor。 */
    client?: import('../../../sandbox/interface/runtime').SandboxClient;
    executor?: AgentLoopSandboxExecutor;
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
