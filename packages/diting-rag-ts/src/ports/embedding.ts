// src/ports/embedding.ts
// Embedding Provider 接口

/**
 * Embedding 结果
 */
export interface EmbedResult {
  vectors: number[][];
  tokens: number;
}

/**
 * Embedding 接口
 */
export interface EmbeddingProvider {
  /**
   * 文本向量化
   */
  embed(texts: string[]): Promise<EmbedResult>;

  /**
   * 获取模型信息
   */
  getModelInfo(): { name: string; dimension: number };
}
