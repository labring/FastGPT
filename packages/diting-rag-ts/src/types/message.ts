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
}

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
