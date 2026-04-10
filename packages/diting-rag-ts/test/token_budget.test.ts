// src/utils/token_budget.test.ts
import { describe, it, expect } from 'vitest';
import { estimateTokens, fitChunks } from '../src/utils/token_budget';
import type { ChunkItem } from '../src/types/chunk';

describe('token_budget', () => {
  describe('estimateTokens', () => {
    it('should estimate tokens for English text', () => {
      const text = 'Hello world';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for Chinese text', () => {
      const text = '你好世界';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate tokens for empty string', () => {
      const tokens = estimateTokens('');
      expect(tokens).toBe(0);
    });
  });

  describe('fitChunks', () => {
    it('should return empty array for empty input', () => {
      const result = fitChunks([], 100);
      expect(result).toEqual([]);
    });

    it('should fit chunks within budget', () => {
      const chunks: ChunkItem[] = [
        {
          id: '1',
          content: 'Hello world this is a test',
          score: 0.9,
          datasetId: 'd1',
          sourceName: 'test1'
        },
        {
          id: '2',
          content: 'Another chunk with more text',
          score: 0.8,
          datasetId: 'd1',
          sourceName: 'test2'
        }
      ];
      const result = fitChunks(chunks, 1000);
      expect(result.length).toBe(2); // both fit within 1000 tokens
    });

    it('should respect token budget limit', () => {
      const chunks: ChunkItem[] = [
        { id: '1', content: 'A'.repeat(100), score: 0.9, datasetId: 'd1', sourceName: 'test1' },
        { id: '2', content: 'B'.repeat(100), score: 0.8, datasetId: 'd1', sourceName: 'test2' }
      ];
      // budget = 80 tokens (each chunk ~50 + 30 overhead = 80)
      const result = fitChunks(chunks, 80);
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1'); // first chunk fits
    });
  });
});
