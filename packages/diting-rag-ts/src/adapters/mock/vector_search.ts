// src/adapters/mock/vector_search.ts
// Mock Vector Search Provider

import type { VectorSearchProvider, VectorSearchOptions, SearchResult } from '../../ports/search';
import { createSearchResult } from '../../ports/search';
import type { ChunkResult } from '../../types/chunk';

export class MockVectorSearchProvider implements VectorSearchProvider {
  public readonly type = 'fastgpt' as const;

  constructor(private chunks: ChunkResult[] = []) {}

  async search(
    _vectors: number[][],
    _datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    const result = this.chunks.slice(0, options.limit);
    return createSearchResult(result, 'vector', 'mock');
  }
}
