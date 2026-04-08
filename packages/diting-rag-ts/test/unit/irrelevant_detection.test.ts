// test/unit/irrelevant_detection.test.ts
import { describe, it, expect } from 'vitest';
import { isSearchIrrelevant } from '../../src/agent/nodes';
import type { ChunkItem } from '../../src/types/chunk';

function makeChunk(overrides: Partial<ChunkItem> = {}): ChunkItem {
  return {
    id: 'c1',
    content: 'test content',
    score: 0.5,
    datasetId: 'd1',
    sourceName: 'test',
    ...overrides
  };
}

describe('isSearchIrrelevant', () => {
  it('returns true for empty chunks', () => {
    expect(isSearchIrrelevant([])).toBe(true);
  });

  it('returns true when all BGE scores below 0.2 (no LLM score)', () => {
    const chunks = [
      makeChunk({ id: 'c1', score: 0.05 }),
      makeChunk({ id: 'c2', score: 0.1 }),
      makeChunk({ id: 'c3', score: 0.15 })
    ];
    expect(isSearchIrrelevant(chunks)).toBe(true);
  });

  it('returns false when at least one BGE score >= 0.2 (no LLM score)', () => {
    const chunks = [makeChunk({ id: 'c1', score: 0.05 }), makeChunk({ id: 'c2', score: 0.25 })];
    expect(isSearchIrrelevant(chunks)).toBe(false);
  });

  it('returns true when all LLM scores < 3 (even if BGE is high)', () => {
    const chunks = [
      makeChunk({ id: 'c1', score: 0.95, llm_sub_query_score: 1 }),
      makeChunk({ id: 'c2', score: 0.88, llm_sub_query_score: 2 })
    ];
    // LLM优先：bestLLM=2 < 3 → irrelevant
    expect(isSearchIrrelevant(chunks)).toBe(true);
  });

  it('returns false when at least one LLM score >= 3 (even if BGE is low)', () => {
    const chunks = [
      makeChunk({ id: 'c1', score: 0.05, llm_sub_query_score: 1 }),
      makeChunk({ id: 'c2', score: 0.08, llm_sub_query_score: 5 })
    ];
    // LLM优先：bestLLM=5 >= 3 → relevant
    expect(isSearchIrrelevant(chunks)).toBe(false);
  });

  it('falls back to BGE when only some chunks have LLM scores (edge case: mixed)', () => {
    // 若只有部分 chunks 有 LLM score，仍基于有 LLM score 的那部分判断
    const chunks = [
      makeChunk({ id: 'c1', score: 0.05, llm_sub_query_score: 2 }),
      makeChunk({ id: 'c2', score: 0.9 }) // 无 LLM score
    ];
    // llmScores=[2], bestLLM=2 < 3 → irrelevant (LLM wins even though BGE of c2 is high)
    expect(isSearchIrrelevant(chunks)).toBe(true);
  });

  it('returns false when rerankScore is used instead of score', () => {
    const chunks = [makeChunk({ id: 'c1', score: 0.0, rerankScore: 0.75 })];
    // 无 LLM score，使用 rerankScore ?? score = 0.75 >= 0.2 → relevant
    expect(isSearchIrrelevant(chunks)).toBe(false);
  });
});
