// src/adapters/built-in/embedding/adapter.ts
// Built-in Embedding 适配器 - 调用兼容 OpenAI API 的远程 Embedding 服务

import type { EmbeddingProvider } from '../../../ports/embedding';
import type { Logger } from '../../../ports/logger';

/**
 * Built-in Embedding 配置
 */
export interface BuiltInEmbeddingConfig {
  apiKey?: string;
  endpoint?: string;
  model?: string;
  dimension?: number;
  timeout?: number;
  logger?: Logger;
}

/**
 * Built-in Embedding 适配器
 * 通过环境变量配置，调用兼容 OpenAI API 的远程服务（如 Ollama、vLLM 等）
 */
export class BuiltInEmbeddingAdapter implements EmbeddingProvider {
  public readonly type = 'builtin' as const;

  private apiKey: string;
  private endpoint: string;
  private model: string;
  private dimension: number;
  private timeout: number;
  private logger?: Logger;

  constructor(config: BuiltInEmbeddingConfig = {}) {
    this.apiKey = config.apiKey || process.env.EMBEDDING_API_KEY || '';
    this.endpoint = config.endpoint || process.env.EMBEDDING_BASE_URL || 'http://aiproxy:3000/v1';
    this.model = config.model || process.env.EMBEDDING_MODEL || 'bge-m3';
    this.dimension = config.dimension || 1024;
    this.timeout = config.timeout || 60000;
    this.logger = config.logger;
  }

  /**
   * 构建请求头
   */
  private getHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`
    };
  }

  /**
   * 生成 Embedding
   */
  async embed(texts: string[]): Promise<{ vectors: number[][]; tokens: number }> {
    this.logger?.debug('[Embedding] embed called', { textCount: texts.length });
    const body: Record<string, unknown> = {
      model: this.model,
      input: texts
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.endpoint}/embeddings`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Embedding API error: ${response.status} ${errorText}`);
      }

      const data = (await response.json()) as {
        data?: Array<{ embedding: number[] }>;
        usage?: { total_tokens?: number };
      };

      const vectors = data.data?.map((item) => item.embedding) || [];
      const tokens =
        data.usage?.total_tokens || texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0);

      return { vectors, tokens };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * 获取模型信息
   */
  getModelInfo() {
    return {
      name: this.model,
      dimension: this.dimension
    };
  }
}
