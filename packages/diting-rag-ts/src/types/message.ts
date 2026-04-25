// src/types/message.ts
// LLM 消息类型

export type MessageRole = 'system' | 'user' | 'assistant';

export interface LLMMessage {
  role: MessageRole;
  content: string;
  name?: string; // 用于 function calling
  id?: string; // 用于 ID 替换（Blackboard Brief）
}

/**
 * LLM 调用选项
 */
export interface LLMCallOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  toolChoice?: string | { type: 'function'; function: { name: string } };
  /** 启用思考/推理模式（deepseek-r1、Qwen3 等），会显著增加 token 消耗 */
  enableThinking?: boolean;
  /** 透传到 API body 的额外字段（如 enable_thinking、chat_template_kwargs 等） */
  extra?: Record<string, unknown>;
  /** 透传给底层 SDK 的请求选项（如 headers、path、timeout 等） */
  requestOptions?: unknown;
}

/**
 * LLM 调用默认选项。
 * diting-rag-ts 的 agentic search 过程要求默认禁用 thinking，避免 Qwen3 等模型默认开启思考模式。
 * 各 provider 实现应在 chat/chatStream 中以此为基础，用调用方传入的 options 覆盖。
 */
export const DEFAULT_LLM_CALL_OPTIONS: LLMCallOptions = {
  enableThinking: false,
  extra: {
    chat_template_kwargs: { enable_thinking: false }
  }
};

/**
 * Tool 定义（用于 function calling）
 */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
}

/**
 * LLM 响应
 */
export interface LLMResponse {
  content: string;
  reasoning?: string; // 思考过程（部分模型支持）
  toolCalls?: ToolCall[];
  usage?: {
    inputTokens?: number; // prompt tokens
    outputTokens?: number; // completion tokens
  };
}

/**
 * Tool 调用
 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}
