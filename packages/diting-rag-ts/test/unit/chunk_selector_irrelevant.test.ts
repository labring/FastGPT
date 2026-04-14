// test/unit/chunk_selector_irrelevant.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { ChunkSelectorSkill } from '../../src/skills/atomic/chunk_selector';
import { MockLLMProvider } from '../../src/adapters/mock/llm';
import type { ChunkItem } from '../../src/types/chunk';

function makeChunk(id: string, score: number): ChunkItem {
  return {
    id,
    content: `Content for chunk ${id}. `.repeat(20),
    score,
    datasetId: 'd1',
    sourceName: 'test'
  };
}

describe('ChunkSelectorSkill — irrelevant gate', () => {
  let skill: ChunkSelectorSkill;

  beforeEach(() => {
    skill = new ChunkSelectorSkill();
    skill.initializeProvider(new MockLLMProvider({ responses: ['5'] }));
  });

  it('returns empty array when all chunks have BGE score < 0.2', async () => {
    const chunks: ChunkItem[] = [
      makeChunk('c1', 0.05),
      makeChunk('c2', 0.08),
      makeChunk('c3', 0.12),
      makeChunk('c4', 0.1),
      makeChunk('c5', 0.07)
    ];

    const result = await skill.execute({
      query: '腾讯有多少员工',
      chunks,
      tokenBudget: 10000,
      playbook: 'simple_query',
      enableLLMRerank: false
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { selectedChunks: ChunkItem[] };
      expect(data.selectedChunks.length).toBe(0);
    }
  });

  it('does NOT activate gate when at least one chunk has score >= 0.2', async () => {
    const chunks: ChunkItem[] = [
      makeChunk('c1', 0.05),
      makeChunk('c2', 0.25),
      makeChunk('c3', 0.08)
    ];

    const result = await skill.execute({
      query: 'NGFW 配置',
      chunks,
      tokenBudget: 10000,
      playbook: 'simple_query',
      enableLLMRerank: false
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { selectedChunks: ChunkItem[] };
      expect(data.selectedChunks.length).toBeGreaterThan(0);
    }
  });

  it('forces MIN_KEEP when chunks are relevant (existing behavior unchanged)', async () => {
    const chunks: ChunkItem[] = Array.from({ length: 8 }, (_, i) =>
      makeChunk(`c${i}`, 0.9 - i * 0.05)
    );

    const result = await skill.execute({
      query: 'NGFW 防火墙策略',
      chunks,
      tokenBudget: 10000,
      playbook: 'simple_query',
      enableLLMRerank: false
    });

    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { selectedChunks: ChunkItem[] };
      expect(data.selectedChunks.length).toBeGreaterThanOrEqual(3);
    }
  });
});
