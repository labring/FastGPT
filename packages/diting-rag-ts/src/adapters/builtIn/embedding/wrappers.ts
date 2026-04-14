// src/adapters/built-in/embedding/wrappers.ts
// Built-in Embedding Provider Wrappers

import type { EmbeddingProvider } from '../../../ports/embedding';
import type { Logger } from '../../../ports/logger';
import { BuiltInEmbeddingAdapter, type BuiltInEmbeddingConfig } from './adapter';

export { type BuiltInEmbeddingConfig } from './adapter';

/**
 * 创建 Built-in Embedding Provider
 * 通过环境变量配置：
 * - EMBEDDING_API_KEY: API 密钥
 * - EMBEDDING_BASE_URL: API 端点 (默认 http://aiproxy:3000/v1)
 * - EMBEDDING_MODEL: 模型名称 (默认 bge-m3)
 */
export function createBuiltInEmbeddingProvider(
  config?: BuiltInEmbeddingConfig,
  logger?: Logger
): EmbeddingProvider {
  return new BuiltInEmbeddingAdapter({ ...config, logger });
}
