// src/adapters/built-in/llm/wrappers.ts
// Built-in LLM Provider Wrappers

import type { LLMProvider } from '../../../ports/llm';
import type { Logger } from '../../../ports/logger';
import { BuiltInLLMAdapter, type BuiltInLLMConfig } from './adapter';

export { type BuiltInLLMConfig } from './adapter';

/**
 * 创建 Built-in LLM Provider
 * 通过环境变量配置：
 * - LLM_API_KEY: API 密钥
 * - LLM_ENDPOINT: API 端点 (默认 http://fastgpt-aiproxy:3000/v1)
 * - LLM_MODEL: 模型名称 (默认 Qwen3-Next-80B-A3B-Instruct-FP8)
 */
export function createBuiltInLLMProvider(config?: BuiltInLLMConfig, logger?: Logger): LLMProvider {
  return new BuiltInLLMAdapter({ ...config, logger });
}
