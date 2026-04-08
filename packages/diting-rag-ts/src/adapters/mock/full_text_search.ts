// src/adapters/mock/full_text_search.ts
// Mock Full Text Search Provider

import type {
  FullTextSearchProvider,
  FullTextSearchOptions,
  SearchResult
} from '../../ports/search';
import { createSearchResult } from '../../ports/search';
import type { ChunkResult } from '../../types/chunk';

export class MockFullTextSearchProvider implements FullTextSearchProvider {
  public readonly type = 'fastgpt' as const;

  constructor(private chunks: ChunkResult[] = []) {}

  async search(
    _query: string,
    _datasetIds: string[],
    options: FullTextSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    const result = this.chunks.slice(0, options.limit);
    return createSearchResult(result, 'fulltext', 'mock');
  }
}
