// src/adapters/builtIn/mixed/index.ts
// 内置 MixedSearchProvider - 向量检索 + 全文检索 + RRF 融合

import type {
  MixedSearchProvider,
  MixedSearchOptions,
  VectorSearchProvider,
  FullTextSearchProvider,
  SearchResult
} from '../../../ports/search';
import { createSearchResult } from '../../../ports/search';
import type { EmbeddingProvider } from '../../../ports/embedding';
import type { ChunkResult } from '../../../types/chunk';
import type { Logger } from '../../../ports/logger';

/**
 * 内置 Mixed Search Provider
 * 封装 vector search + full text search + RRF 融合，实现 MixedSearchProvider 接口
 */
export class BuiltInMixedSearchProvider implements MixedSearchProvider {
  constructor(
    private vectorSearch: VectorSearchProvider,
    private fullTextSearch: FullTextSearchProvider,
    private logger?: Logger
  ) {}

  async search(
    query: string,
    datasetIds: string[],
    options: MixedSearchOptions,
    embeddingOrVectors: {
      vectors?: number[][];
      embeddingProvider?: EmbeddingProvider;
    }
  ): Promise<SearchResult<ChunkResult>> {
    const { limit, vectorWeight = 0.5 } = options;
    const ftWeight = 1 - vectorWeight;

    let vectors: number[][] = embeddingOrVectors.vectors ?? [];

    // 若没有预计算向量，用 embeddingProvider 计算
    if (vectors.length === 0 && embeddingOrVectors.embeddingProvider) {
      try {
        const embedResult = await embeddingOrVectors.embeddingProvider.embed([query]);
        vectors = embedResult.vectors;
      } catch (e) {
        this.logger?.warn('[BuiltInMixedSearch] embedding failed:', {
          message: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // 并行执行向量检索和全文检索
    const [vectorResult, ftResult] = await Promise.allSettled([
      vectors.length > 0
        ? this.vectorSearch.search(vectors, datasetIds, {
            limit,
            filter: options.filter
          })
        : Promise.resolve(createSearchResult([], 'vector', 'builtIn')),
      this.fullTextSearch.search(query, datasetIds, { limit })
    ]);

    const vectorChunks = vectorResult.status === 'fulfilled' ? vectorResult.value.chunks : [];
    const ftChunks = ftResult.status === 'fulfilled' ? ftResult.value.chunks : [];

    this.logger?.debug(
      `[BuiltInMixedSearch] vector chunks: ${vectorChunks.length}, ft chunks: ${ftChunks.length}`
    );

    // RRF 融合
    const rrfMap = new Map<string, { chunk: ChunkResult; rrfScore: number }>();

    const addList = (list: ChunkResult[], weight: number, source: 'vector' | 'fulltext') => {
      list.forEach((chunk, index) => {
        const rank = index + 1;
        const score = weight * (1 / (60 + rank));
        const existing = rrfMap.get(chunk.id);
        if (existing) {
          existing.rrfScore += score;
          // 保留各来源的原始分数
          if (source === 'vector' && chunk.vectorScore !== undefined) {
            existing.chunk.vectorScore = Math.max(
              existing.chunk.vectorScore ?? 0,
              chunk.vectorScore
            );
          } else if (source === 'fulltext' && chunk.fullTextScore !== undefined) {
            existing.chunk.fullTextScore = Math.max(
              existing.chunk.fullTextScore ?? 0,
              chunk.fullTextScore
            );
          }
        } else {
          rrfMap.set(chunk.id, { chunk: { ...chunk }, rrfScore: score });
        }
      });
    };

    addList(vectorChunks, vectorWeight, 'vector');
    addList(ftChunks, ftWeight, 'fulltext');

    const merged = Array.from(rrfMap.values())
      .sort((a, b) => b.rrfScore - a.rrfScore)
      .slice(0, limit)
      .map(({ chunk, rrfScore }) => ({ ...chunk, score: rrfScore }));

    return {
      chunks: merged,
      meta: {
        searchSource: 'mixed',
        provider: 'builtIn',
        duration: 0
      }
    };
  }
}

/**
 * 创建内置 MixedSearchProvider
 */
export function createBuiltInMixedSearchProvider(
  vectorSearch: VectorSearchProvider,
  fullTextSearch: FullTextSearchProvider,
  logger?: Logger
): MixedSearchProvider {
  return new BuiltInMixedSearchProvider(vectorSearch, fullTextSearch, logger);
}
