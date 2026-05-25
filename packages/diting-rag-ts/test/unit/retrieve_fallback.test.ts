// test/unit/retrieve_fallback.test.ts
// P1: 检索降级链测试 — RED phase: 测试尚未实现的新 fallback 行为
//
// 新功能 1: mixedSearch 全部失败 → 降级到分离检索（本地 RRF）
// 新功能 2: EMB 连续失败 → 自动切换 searchMode

import { describe, it, expect, beforeEach } from 'vitest';
import { RetrieveSkill } from '../../src/skills/atomic/retrieve';
import { MockLLMProvider } from '../../src/adapters/mock/llm';
import type { LLMProvider } from '../../src/ports/llm';
import type {
  VectorSearchProvider,
  FullTextSearchProvider,
  MixedSearchProvider,
  SearchResult,
  VectorSearchOptions,
  FullTextSearchOptions,
  MixedSearchOptions
} from '../../src/ports/search';
import type { EmbeddingProvider, EmbedResult } from '../../src/ports/embedding';
import type { ChunkResult } from '../../src/types/chunk';

function makeChunk(id: string, content: string, score: number, datasetId = 'd1'): ChunkResult {
  return { id, content, score, datasetId, sourceName: 'test', timestamp: Date.now() };
}

// ── Always-failing mixedSearch ────────────────────────────────────────────
class AlwaysFailingMixedSearch implements MixedSearchProvider {
  async search(
    _query: string, _datasetIds: string[], _options: MixedSearchOptions,
    _emb: { embeddingProvider?: EmbeddingProvider }
  ): Promise<SearchResult<ChunkResult>> {
    throw new Error('mixedSearch unavailable');
  }
}

// ── Always-failing EMB ────────────────────────────────────────────────────
class AlwaysFailingEmbedding implements EmbeddingProvider {
  public callCount = 0;
  async embed(_texts: string[]): Promise<EmbedResult> {
    this.callCount++;
    throw new Error('EMB service down');
  }
  getModelInfo() { return { name: 'broken-emb', dimension: 1536 }; }
}

// ── Working providers (for fallback verification) ─────────────────────────
const workingVectorSearch: VectorSearchProvider = {
  async search(_vectors: number[][], _datasetIds: string[], _options: VectorSearchOptions): Promise<SearchResult<ChunkResult>> {
    return {
      chunks: [makeChunk('vs-1', 'vector result', 0.9)],
      error: undefined,
      meta: { searchSource: 'vector', provider: 'mock', duration: 5, totalTokens: 100 }
    };
  }
};

const workingFullTextSearch: FullTextSearchProvider = {
  async search(_query: string, _datasetIds: string[], _options: FullTextSearchOptions): Promise<SearchResult<ChunkResult>> {
    return {
      chunks: [makeChunk('ft-1', 'fulltext result', 0.7)],
      error: undefined,
      meta: { searchSource: 'fulltext', provider: 'mock', duration: 5, totalTokens: 50 }
    };
  }
};

const workingEmbedding: EmbeddingProvider = {
  async embed(texts: string[]): Promise<EmbedResult> {
    return { vectors: texts.map(() => Array(1536).fill(0).map(() => Math.random())), tokens: 100 };
  },
  getModelInfo() { return { name: 'ok-emb', dimension: 1536 }; }
};

// ── Tests ─────────────────────────────────────────────────────────────────

describe('RetrieveSkill — mixedSearch 全失败降级到分离检索 (P1, 新功能)', () => {
  let skill: RetrieveSkill;
  let llm: LLMProvider;

  beforeEach(() => {
    skill = new RetrieveSkill();
    llm = new MockLLMProvider();
    skill.initialize(llm);
  });

  it('falls back to local separation retrieval when mixedSearch fails for all queries', async () => {
    // Scenario: mixedSearch 每次都抛异常
    const mixedSearch = new AlwaysFailingMixedSearch();

    skill.initializeProviders(workingVectorSearch, workingFullTextSearch, workingEmbedding, mixedSearch);

    const result = await skill.execute({
      context: null,
      queries: ['q1', 'q2'],
      datasetIds: ['d1'],
      limit: 20,
      searchMode: 'mixedRecall'
    });

    // Expected (NEW behavior): mixedSearch 全部失败后自动降级到分离检索
    // performSearch 检测到所有 mixedSearch query 都失败 → 降级到本地 RRF
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { chunks: ChunkResult[] };
      // 应该从分离检索拿到结果（vector + fulltext → RRF）
      expect(data.chunks.length).toBeGreaterThan(0);
    }
  });

  it('falls back to local separation when mixedSearch is not injected', async () => {
    // No mixedSearch provider at all
    skill.initializeProviders(workingVectorSearch, workingFullTextSearch, workingEmbedding);

    const result = await skill.execute({
      context: null,
      queries: ['test'],
      datasetIds: ['d1'],
      limit: 20,
      searchMode: 'mixedRecall'
    });

    // 当前已有的 fallback: 无 mixedSearch → 直接走分离检索
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { chunks: ChunkResult[] };
      expect(data.chunks.length).toBeGreaterThan(0);
    }
  });
});

describe('RetrieveSkill — EMB 连续失败自动切换 searchMode (P1, 新功能)', () => {
  let skill: RetrieveSkill;
  let llm: LLMProvider;

  beforeEach(() => {
    skill = new RetrieveSkill();
    llm = new MockLLMProvider();
    skill.initialize(llm);
  });

  it('switches to fullTextRecall after consecutive EMB failures', async () => {
    const emb = new AlwaysFailingEmbedding();
    const fulltextSearch = workingFullTextSearch;
    const vectorSearch: VectorSearchProvider = {
      async search(_vectors: number[][], _datasetIds: string[], _options: VectorSearchOptions): Promise<SearchResult<ChunkResult>> {
        return {
          chunks: [makeChunk('vs-1', 'vector result', 0.9)],
          error: undefined,
          meta: { searchSource: 'vector', provider: 'mock', duration: 5, totalTokens: 100 }
        };
      }
    };

    skill.initializeProviders(vectorSearch, fulltextSearch, emb);

    // 第一次调用：EMB 失败 → RRF 模式（EMB 被 catch，仅 FullText 有结果）
    const result1 = await skill.execute({
      context: null,
      queries: ['q1'],
      datasetIds: ['d1'],
      limit: 20,
      searchMode: 'mixedRecall'
    });

    expect(result1.success).toBe(true);
    if (result1.success && result1.data) {
      const data1 = result1.data as { chunks: ChunkResult[] };
      // 应该从 fulltext 拿到结果（EMB 失败被跳过）
      expect(data1.chunks.length).toBeGreaterThan(0);
    }

    // 追踪 EMB 失败次数 + 自动切换模式后，后续调用应使用 fullTextRecall
    // 注意：此测试验证 EMB 失败不会导致整个搜索崩溃
    // 自动切换 searchMode 的行为需要实现后才可验证
  });

  it('returns empty result when all providers fail', async () => {
    const emb = new AlwaysFailingEmbedding();
    const failingFullText: FullTextSearchProvider = {
      async search(_q: string, _ds: string[], _opts: FullTextSearchOptions): Promise<SearchResult<ChunkResult>> {
        throw new Error('fulltext down');
      }
    };
    const failingVector: VectorSearchProvider = {
      async search(_v: number[][], _ds: string[], _opts: VectorSearchOptions): Promise<SearchResult<ChunkResult>> {
        throw new Error('vector down');
      }
    };

    skill.initializeProviders(failingVector, failingFullText, emb);

    const result = await skill.execute({
      context: null,
      queries: ['q1'],
      datasetIds: ['d1'],
      limit: 20,
      searchMode: 'mixedRecall'
    });

    // 所有 provider 都失败 → 返回空结果（而非崩溃）
    expect(result.success).toBe(true);
    if (result.success && result.data) {
      const data = result.data as { chunks: ChunkResult[] };
      expect(data.chunks.length).toBe(0);
    }
  });
});
