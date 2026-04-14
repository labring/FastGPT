// src/skills/atomic/chunk_selector.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkSelectorSkill } from '../../../src/skills/atomic/chunk_selector';
import { MockLLMProvider } from '../../../src/adapters/mock/llm';
import type { ChunkItem } from '../../../src/types/chunk';

describe('ChunkSelectorSkill', () => {
  let chunkSelectorSkill: ChunkSelectorSkill;
  let mockLLM: MockLLMProvider;

  beforeEach(() => {
    chunkSelectorSkill = new ChunkSelectorSkill();
    mockLLM = new MockLLMProvider({
      responses: [
        JSON.stringify({
          selected: [0, 1],
          reason: 'Selected relevant chunks'
        })
      ]
    });
    chunkSelectorSkill.initializeProvider(mockLLM);
  });

  describe('execute', () => {
    it('should select chunks within token budget', async () => {
      const chunks: ChunkItem[] = [
        { id: '1', content: 'Short content', score: 0.9, datasetId: 'd1', sourceName: 'test1' },
        {
          id: '2',
          content: 'Another short content',
          score: 0.8,
          datasetId: 'd1',
          sourceName: 'test2'
        },
        { id: '3', content: 'More content here', score: 0.7, datasetId: 'd1', sourceName: 'test3' }
      ];

      const result = await chunkSelectorSkill.execute({
        query: 'test query',
        chunks,
        tokenBudget: 1000,
        playbook: 'simple_query'
      });

      expect(result.success).toBe(true);
      if (result.success && result.data) {
        const data = result.data as { selectedChunks: ChunkItem[] };
        expect(data.selectedChunks.length).toBeGreaterThan(0);
      }
    });

    it('should handle empty chunks', async () => {
      const result = await chunkSelectorSkill.execute({
        query: 'test query',
        chunks: [],
        tokenBudget: 1000,
        playbook: 'simple_query'
      });

      expect(result.success).toBe(true);
    });
  });
});
