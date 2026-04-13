// src/adapters/mock/reranker.ts
// Mock Rerank Provider

import type { RerankProvider } from '../../ports/reranker';
import type { ChunkResult } from '../../types/chunk';

export class MockRerankProvider implements RerankProvider {
  public readonly type = 'fastgpt' as const;

  async rerank(
    _query: string,
    chunks: ChunkResult[]
  ): Promise<Array<ChunkResult & { rerankScore: number }>> {
    return chunks.map((chunk, index) => ({
      ...chunk,
      rerankScore: 1 - index * 0.1
    }));
  }
}
