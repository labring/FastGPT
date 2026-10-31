import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageContentPart
} from '@fastgpt/global/core/ai/llm/type';
import { maxToolImagePartAmount } from '@fastgpt/global/common/file/constants';
import type { SandboxClient } from '../../../sandbox/application/runtime/client';
import type { SandboxToolCallValidator } from '../../../sandbox/application/toolCall/type';
import type { AgentLoopDatasetSearchExecutor } from './systemTool/datasetSearch';
import type { AgentAskPayload } from '@fastgpt/global/core/ai/agent/type';
import type { AgentLoopUsage } from './usage';

export type AgentLoopToolCatalog = {
  runtimeTools: ChatCompletionTool[];
  batchToolSize?: number;
};

/**
 * 构造写入 tool message 的 content：
 * - 无结构化 parts 时直接用文本字符串；
 * - 有 parts 时把最终要发送的文本作为 text part 拼在图片等 parts 前，
 *   保证模型实际拿到的文本与展示/计费统计一致（文本已压缩时传压缩后的值）。
 *
 * fastAgent 与 piAgent 共用这层组合规则，避免两条 provider 路径对同一个工具结果
 * 给出不同的内容：业务 response 文本永远保留，图片只作为附加 part。
 *
 * 图片数量按 `maxToolImagePartAmount` 截断：一次工具调用列出很多文件时，每轮请求都会重复
 * 下载并内联这些图片，必须限制单个工具结果的视觉输入量。
 */
export const buildToolMessageContent = ({
  content,
  text
}: {
  content?: ChatCompletionToolMessageContentPart[];
  text: string;
}): string | ChatCompletionToolMessageContentPart[] => {
  if (!content?.length) return text;

  const images = content.filter((part) => part.type !== 'text').slice(0, maxToolImagePartAmount);

  return images.length ? [{ type: 'text', text }, ...images] : text;
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
  /** 隐藏工具卡，但调用和结果仍完整进入模型上下文。 */
  hideInUI?: boolean;
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

export type AgentLoopAskValidator = (
  ask: AgentAskPayload
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
    client: SandboxClient;
    /** 业务访问限制在执行前校验，所有工具仍统一通过 client 执行。 */
    validate?: SandboxToolCallValidator;
    /** 仅调用方显式配置时，目录内的 sandbox_read_file 只公开活动信息；不限制模型读取和工具执行。 */
    internalReadDirectories?: string[];
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
