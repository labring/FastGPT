// src/skills/atomic/retrieve.ts
// Retrieve Skill - 向量检索 + 全文检索

import type { SkillInput, SkillOutput } from '../base';
import { BaseSkill } from '../base';
import type { ChunkItem, ChunkResult } from '../../types/chunk';
import type {
  VectorSearchProvider,
  FullTextSearchProvider,
  MixedSearchProvider
} from '../../ports/search';
import type { EmbeddingProvider } from '../../ports/embedding';

/**
 * 检索选项
 */
export interface RetrieveOptions {
  queries: string[];
  datasetIds: string[];
  limit?: number;
  searchMode?: 'embedding' | 'fullTextRecall' | 'mixedRecall';
  forbidCollectionIds?: string[];
}

/**
 * 检索结果
 */
export interface RetrieveResult {
  chunks: ChunkItem[];
  queries: string[];
}

/**
 * Retrieve Skill
 * 向量检索 + 全文检索
 * mixedRecall 模式优先使用注入的 MixedSearchProvider（调用 FastGPT capabilities.mixedRecall）
 * 若未注入则降级为分开检索 + 本地 RRF 融合
 */
export class RetrieveSkill extends BaseSkill {
  name = 'retrieve';
  description = 'Retrieve chunks from vector and full-text search';

  private vectorSearch?: VectorSearchProvider;
  private fullTextSearch?: FullTextSearchProvider;
  private mixedSearch?: MixedSearchProvider;
  private embed?: EmbeddingProvider;

  initializeProviders(
    vectorSearch: VectorSearchProvider,
    fullTextSearch: FullTextSearchProvider,
    embed: EmbeddingProvider,
    mixedSearch?: MixedSearchProvider
  ): void {
    this.vectorSearch = vectorSearch;
    this.fullTextSearch = fullTextSearch;
    this.embed = embed;
    this.mixedSearch = mixedSearch;
  }

  async execute(input: SkillInput): Promise<SkillOutput> {
    const {
      queries,
      datasetIds,
      limit = 20,
      searchMode = 'mixedRecall',
      forbidCollectionIds
    } = input as unknown as RetrieveOptions;

    if (!queries || queries.length === 0) {
      return this.success({ chunks: [], queries: [], embeddingTokens: 0 });
    }
    if (!datasetIds || datasetIds.length === 0) {
      return this.success({ chunks: [], queries: [], embeddingTokens: 0 });
    }

    this.logger?.debug('[RetrieveSkill] execute with:', {
      queries: queries?.slice(0, 2),
      datasetIds,
      limit,
      searchMode
    });

    if (!this.vectorSearch || !this.fullTextSearch || !this.embed) {
      return this.fail('Providers not initialized');
    }

    try {
      const results = await this.performSearch(
        queries,
        datasetIds,
        { limit, forbidCollectionIds },
        searchMode
      );

      return this.success({
        chunks: results.chunks,
        queries,
        embeddingTokens: results.embeddingTokens
      });
    } catch (error) {
      return this.fail(`Search failed: ${error}`);
    }
  }

  private async performSearch(
    queries: string[],
    datasetIds: string[],
    options: { limit: number; forbidCollectionIds?: string[] },
    searchMode: string
  ): Promise<{ chunks: ChunkItem[]; embeddingTokens: number }> {
    // mixedRecall 优先使用 MixedSearchProvider（调用 FastGPT capabilities.mixedRecall）
    // 避免分开调用 vector+fulltext 再手动 RRF 导致的分数异常及搜索无结果问题
    if (searchMode === 'mixedRecall' && this.mixedSearch) {
      this.logger?.debug('[RetrieveSkill] calling mixedRecall...');
      return this.performMixedSearch(queries, datasetIds, options);
    }

    // fallback: 分开检索 + 本地 RRF 融合（mixedSearch 未注入时使用）
    const embeddingResults: ChunkResult[] = [];
    const fullTextResults: ChunkResult[] = [];
    let embeddingTokens = 0;

    // 向量检索
    if (searchMode === 'embedding' || searchMode === 'mixedRecall') {
      try {
        const { vectors, tokens } = await this.getVectors(queries);
        embeddingTokens += tokens;
        for (const vector of vectors) {
          const results = await this.vectorSearch!.search([vector], datasetIds, {
            limit: options.limit,
            filter: { forbidCollectionIds: options.forbidCollectionIds }
          });
          embeddingResults.push(...results.chunks);
        }
      } catch (e) {
        this.logger?.warn('[RetrieveSkill] vector search error (ignored):', {
          message: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // 全文检索
    if (searchMode === 'fullTextRecall' || searchMode === 'mixedRecall') {
      for (const query of queries) {
        try {
          const results = await this.fullTextSearch!.search(query, datasetIds, {
            limit: options.limit
          });
          fullTextResults.push(...results.chunks);
        } catch (e) {
          this.logger?.warn('[RetrieveSkill] full-text search error (ignored):', {
            message: e instanceof Error ? e.message : String(e)
          });
        }
      }
    }

    // mixedRecall: RRF 融合两路结果；单路则直接去重
    if (searchMode === 'mixedRecall') {
      return {
        chunks: this.rrfFusion(
          this.deduplicateChunks(embeddingResults),
          this.deduplicateChunks(fullTextResults),
          0.5
        ),
        embeddingTokens
      };
    }

    const allChunks = searchMode === 'embedding' ? embeddingResults : fullTextResults;
    const deduped = this.deduplicateChunks(allChunks);
    deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return { chunks: deduped.slice(0, options.limit), embeddingTokens };
  }

  /**
   * 使用 MixedSearchProvider 做混合检索（多 query 并行，结果去重合并）
   * 直接调用 FastGPT capabilities.mixedRecall，得到正确的分数和 MongoDB ID
   */
  private async performMixedSearch(
    queries: string[],
    datasetIds: string[],
    options: { limit: number; forbidCollectionIds?: string[] }
  ): Promise<{ chunks: ChunkItem[]; embeddingTokens: number }> {
    const allResults: ChunkResult[] = [];
    let totalTokens = 0;

    this.logger?.info(
      `[RetrieveSkill] performMixedSearch: queries=${JSON.stringify(queries)}, datasetIds=${JSON.stringify(datasetIds)}, limit=${options.limit}`
    );

    await Promise.all(
      queries.map(async (query) => {
        try {
          const result = await this.mixedSearch!.search(
            query,
            datasetIds,
            {
              limit: options.limit,
              filter: { forbidCollectionIds: options.forbidCollectionIds }
            },
            { embeddingProvider: this.embed }
          );
          this.logger?.info(
            `[RetrieveSkill] mixedSearch.search("${query}") → chunks=${result.chunks.length}, error=${result.error?.code ?? 'none'}`
          );
          allResults.push(...result.chunks);
          // 累积 embedding tokens（由 provider 在 meta.totalTokens 中传递）
          totalTokens += result.meta?.totalTokens ?? 0;
        } catch (e) {
          // 升级为 error 级别，包含完整 stack，方便排查
          this.logger?.error(
            `[RetrieveSkill] mixed search FAILED for query="${query}": ${e instanceof Error ? e.stack ?? e.message : String(e)}`
          );
        }
      })
    );

    // 去重，保留分数较高的
    const merged = new Map<string, ChunkResult>();
    for (const chunk of allResults) {
      const existing = merged.get(chunk.id);
      if (!existing || (chunk.score ?? 0) > (existing.score ?? 0)) {
        merged.set(chunk.id, chunk);
      }
    }

    const deduped = Array.from(merged.values()) as ChunkItem[];
    deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    const finalChunks = deduped.slice(0, options.limit);
    this.logger?.info(
      `[RetrieveSkill] performMixedSearch done: allResults=${allResults.length}, deduped=${deduped.length}, final=${finalChunks.length}`
    );

    return {
      chunks: finalChunks,
      embeddingTokens: totalTokens
    };
  }

  /**
   * RRF (Reciprocal Rank Fusion): 融合向量检索和全文检索结果
   */
  private rrfFusion(
    embList: ChunkItem[],
    ftList: ChunkItem[],
    embWeight: number = 0.5
  ): ChunkItem[] {
    const ftWeight = 1 - embWeight;
    // maxOrigScore: 保留各来源中该 chunk 的最高原始相关性分数，供后续阈值判断使用
    // RRF 分数仅用于跨来源排序，数量级远小于余弦相似度，不可直接用于相关性阈值判断
    const rrfMap = new Map<string, { chunk: ChunkItem; rrfScore: number; maxOrigScore: number }>();

    const addList = (list: ChunkItem[], weight: number) => {
      list.forEach((chunk, index) => {
        const rank = index + 1;
        const rrfScore = weight * (1 / (60 + rank));
        const origScore = chunk.score ?? 0;
        const existing = rrfMap.get(chunk.id);
        if (existing) {
          existing.rrfScore += rrfScore;
          existing.maxOrigScore = Math.max(existing.maxOrigScore, origScore);
        } else {
          rrfMap.set(chunk.id, { chunk, rrfScore, maxOrigScore: origScore });
        }
      });
    };

    addList(embList, embWeight);
    addList(ftList, ftWeight);

    return Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .map(({ chunk, maxOrigScore }) => ({ ...chunk, score: maxOrigScore }));
  }

  private async getVectors(queries: string[]): Promise<{ vectors: number[][]; tokens: number }> {
    const result = await this.embed!.embed(queries);
    return { vectors: result.vectors, tokens: result.tokens };
  }

  private deduplicateChunks(chunks: ChunkResult[]): ChunkItem[] {
    const seen = new Set<string>();
    const unique: ChunkItem[] = [];

    for (const chunk of chunks) {
      if (!seen.has(chunk.id)) {
        seen.add(chunk.id);
        unique.push(chunk as ChunkItem);
      }
    }

    return unique;
  }
}
