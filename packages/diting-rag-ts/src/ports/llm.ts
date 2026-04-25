// src/ports/llm.ts
// LLM Provider 接口

import type { LLMMessage, LLMResponse, LLMCallOptions } from '../types/message';
import { DEFAULT_LLM_CALL_OPTIONS } from '../types/message';

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

/**
 * 包装 LLMProvider，自动为所有 chat/chatStream 调用注入默认选项。
 * 确保外部传入的任何 provider 都以 enableThinking=false 的默认行为运行。
 */
export function wrapProviderWithDefaults(provider: LLMProvider): LLMProvider {
  return {
    ...provider,
    chat(messages: LLMMessage[], options?: LLMCallOptions): Promise<LLMResponse> {
      return provider.chat(messages, resolveLLMCallOptions(options));
    },
    chatStream(messages: LLMMessage[], options?: LLMCallOptions): AsyncIterable<LLMResponse> {
      return provider.chatStream(messages, resolveLLMCallOptions(options));
    }
  };
}

/**
 * 合并调用方 options 与 diting-rag-ts 默认选项。
 * 调用方显式字段优先，extra 为浅合并。
 */
export function resolveLLMCallOptions(options?: LLMCallOptions): LLMCallOptions {
  if (!options) return { ...DEFAULT_LLM_CALL_OPTIONS };
  return {
    ...DEFAULT_LLM_CALL_OPTIONS,
    ...options,
    extra: {
      ...DEFAULT_LLM_CALL_OPTIONS.extra,
      ...(options.extra as Record<string, unknown>)
    }
  };
}
