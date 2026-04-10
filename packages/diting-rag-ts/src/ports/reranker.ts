// src/ports/reranker.ts
// Reranker Provider 接口

import type { ChunkResult } from '../types/chunk';

/**
 * Rerank 结果
 */
export interface RerankResult extends ChunkResult {
  rerankScore: number;
}

/**
 * Reranker 接口
 */
export interface RerankProvider {
  rerank(query: string, chunks: ChunkResult[]): Promise<RerankResult[]>;
}
