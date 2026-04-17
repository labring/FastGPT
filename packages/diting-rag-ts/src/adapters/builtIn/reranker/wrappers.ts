// src/adapters/built-in/reranker/wrappers.ts
// Built-in Rerank Provider Wrappers

import type { RerankProvider } from '../../../ports/reranker';
import type { Logger } from '../../../ports/logger';
import { BuiltInRerankAdapter, type BuiltInRerankConfig } from './adapter';

export { type BuiltInRerankConfig } from './adapter';

/**
 * 创建 Built-in Rerank Provider
 * 通过环境变量配置：
 * - RERANK_API_KEY: API 密钥
 * - RERANK_ENDPOINT: API 端点 (默认 http://fastgpt-aiproxy:3000/v1)
 * - RERANK_MODEL: 模型名称 (默认 bge-reranker-large)
 */
export function createBuiltInRerankProvider(
  config?: BuiltInRerankConfig,
  logger?: Logger
): RerankProvider {
  return new BuiltInRerankAdapter({ ...config, logger });
}

/**
 * 别名：createBuiltInRerankerProvider
 */
export const createBuiltInRerankerProvider = createBuiltInRerankProvider;
