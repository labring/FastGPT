// src/ports/llm.ts
// LLM Provider 接口

import type { LLMMessage, LLMResponse, LLMCallOptions } from '../types/message';

/**
 * LLM 推理接口
 */
export interface LLMProvider {
  /**
   * 同步调用 LLM
   */
  chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse>;

  /**
   * 流式调用 LLM
   */
  chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<LLMResponse>;

  /**
   * 获取模型信息
   */
  getModelInfo(): { name: string; contextWindow: number; maxOutputTokens: number };
}
