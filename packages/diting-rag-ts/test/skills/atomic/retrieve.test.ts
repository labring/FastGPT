// src/skills/atomic/retrieve.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { RetrieveSkill } from '../../../src/skills/atomic/retrieve';
import { MockLLMProvider } from '../../../src/adapters/mock/llm';
import { MockVectorSearchProvider } from '../../../src/adapters/mock/vector_search';
import { MockFullTextSearchProvider } from '../../../src/adapters/mock/full_text_search';
import { MockEmbeddingProvider } from '../../../src/adapters/mock/embedding';
import type { ChunkResult } from '../../../src/types/chunk';

describe('RetrieveSkill', () => {
  let retrieveSkill: RetrieveSkill;
  let mockLLM: MockLLMProvider;
  let mockVectorSearch: MockVectorSearchProvider;
  let mockFullTextSearch: MockFullTextSearchProvider;
  let mockEmbed: MockEmbeddingProvider;

  beforeEach(() => {
    retrieveSkill = new RetrieveSkill();
    mockLLM = new MockLLMProvider({
      responses: ['{"queries": ["test query"]}']
    });
    mockVectorSearch = new MockVectorSearchProvider([
      { id: '1', content: 'Test chunk 1', score: 0.9, datasetId: 'd1', sourceName: 'test1' },
      { id: '2', content: 'Test chunk 2', score: 0.8, datasetId: 'd1', sourceName: 'test2' }
    ]);
    mockFullTextSearch = new MockFullTextSearchProvider([
      { id: '3', content: 'Test chunk 3', score: 0.85, datasetId: 'd1', sourceName: 'test3' }
    ]);
    mockEmbed = new MockEmbeddingProvider(1536);

    retrieveSkill.initialize(mockLLM);
    retrieveSkill.initializeProviders(mockVectorSearch, mockFullTextSearch, mockEmbed);
  });

  describe('execute', () => {
    it('should return search results', async () => {
      const result = await retrieveSkill.execute({
        queries: ['test'],
        datasetIds: ['d1'],
        tokenBudget: 8000
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const data = result.data as { chunks: ChunkResult[] };
        expect(data.chunks.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty queries', async () => {
      const result = await retrieveSkill.execute({
        queries: [],
        datasetIds: ['d1'],
        tokenBudget: 8000
      });

      expect(result.success).toBe(true);
    });

    it('should handle empty datasetIds', async () => {
      const result = await retrieveSkill.execute({
        queries: ['test'],
        datasetIds: [],
        tokenBudget: 8000
      });

      expect(result.success).toBe(true);
    });
  });
});
