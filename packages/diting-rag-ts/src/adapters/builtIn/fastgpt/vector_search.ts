// src/adapters/built-in/fastgpt/vector_search.ts
// FastGPT 联合向量检索 Provider - PG 向量检索 + MongoDB 内容获取

import type {
  VectorSearchProvider,
  VectorSearchOptions,
  SearchResult
} from '../../../ports/search';
import { createSearchResult } from '../../../ports/search';
import type { ChunkResult } from '../../../types/chunk';
import { PGVectorAdapter, type PGVectorConfig } from '../pgvector/adapter';
import { MongoDBAdapter, type MongoDBConfig } from '../mongodb/adapter';
import type { Logger } from '../../../ports/logger';

/**
 * FastGPT 联合检索配置
 */
export interface FastGPTVectorSearchConfig {
  pg: PGVectorConfig;
  mongodb: MongoDBConfig;
  logger?: Logger;
}

/**
 * FastGPT 联合向量检索 Provider
 * 封装 PG 向量检索 + MongoDB 内容查询，对外呈现为单一的 VectorSearchProvider
 */
export class FastGPTVectorSearchProvider implements VectorSearchProvider {
  public readonly type = 'fastgpt' as const;

  private pgAdapter: PGVectorAdapter;
  private mongoAdapter: MongoDBAdapter;
  private logger?: Logger;

  constructor(config: FastGPTVectorSearchConfig) {
    this.pgAdapter = new PGVectorAdapter(config.pg);
    this.mongoAdapter = new MongoDBAdapter(config.mongodb);
    this.logger = config.logger;
  }

  /**
   * 初始化（直接连接，不创建表/索引）
   */
  async init(): Promise<void> {
    // 直接连接，不初始化（FastGPT 数据已存在）
    await this.mongoAdapter.init().catch((e) =>
      this.logger?.warn('[FastGPTVectorSearch] MongoDB init warning:', {
        message: e instanceof Error ? e.message : String(e)
      })
    );
    this.logger?.info('[FastGPTVectorSearch] Initialized');
  }

  /**
   * 联合检索: PG 向量搜索 + MongoDB 内容获取
   * ⚡ 性能优化：
   * 1. 只在需要时查询 MongoDB（检查 collectionIds 不为空）
   * 2. 避免重复调用 listDatasets() 进行无必要的日志
   */
  async search(
    vectors: number[][],
    datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    // console.log('[FastGPTVectorSearch] search called:', { datasetIds, vectorCount: vectors.length, targetDim: this.pgAdapter.getVectorDimension() });
    this.logger?.debug('[FastGPTVectorSearch] search called:', {
      datasetIds,
      vectorCount: vectors.length,
      targetDim: this.pgAdapter.getVectorDimension()
    });
    if (vectors.length === 0 || datasetIds.length === 0) {
      return createSearchResult([], 'vector', 'fastgpt');
    }

    try {
      // 1. 将输入向量补零到 PG 期望的维度
      const targetDim = this.pgAdapter.getVectorDimension();
      const paddedVectors = vectors.map((vec) => this.padVector(vec, targetDim));

      // 2. PG 向量检索，获取 vector IDs
      const startTime = Date.now();
      const pgSearchResult = await this.pgAdapter.search(paddedVectors, datasetIds, options);
      const pgResults = pgSearchResult.chunks;
      const pgTime = Date.now() - startTime;

      this.logger?.debug(`[FastGPTVectorSearch] PG results: ${pgResults.length} (${pgTime}ms)`);

      if (pgResults.length === 0) {
        return createSearchResult([], 'vector', 'fastgpt');
      }

      // 3. 从 PG 结果提取 vector IDs 和 collection IDs，去重
      const seenVectorIds = new Set<string>();
      const uniquePgResults: typeof pgResults = [];
      for (const result of pgResults) {
        if (!seenVectorIds.has(result.id)) {
          seenVectorIds.add(result.id);
          uniquePgResults.push(result);
        }
      }
      this.logger?.debug(
        `[FastGPTVectorSearch] PG results dedup: ${pgResults.length} → ${uniquePgResults.length}`
      );

      const vectorIds = uniquePgResults.map((r) => r.id);
      const collectionIds = [
        ...new Set(
          uniquePgResults.map((r) => r.collectionId).filter((id): id is string => Boolean(id))
        )
      ];

      if (collectionIds.length === 0) {
        return createSearchResult(uniquePgResults, 'vector', 'fastgpt');
      }

      // 4. MongoDB 查询内容 (传入 datasetIds 以便更精确匹配)
      const mongoStartTime = Date.now();
      const mongoResults = await this.mongoAdapter.lookupByContentIds(
        vectorIds,
        collectionIds,
        datasetIds
      );
      const mongoTime = Date.now() - mongoStartTime;

      this.logger?.debug(
        `[FastGPTVectorSearch] MongoDB lookup results: ${mongoResults.length} (${mongoTime}ms)`
      );

      // 5. 合并 PG 分数和 MongoDB 内容
      // 关键：只返回 MongoDB 找到的结果（已按 dataId 去重），不返回 PG 结果作为后备
      // 重要：返回的 id 使用 dataId（MongoDB 的 _id），与 MongoDB 全文检索保持一致
      const enrichedResults: ChunkResult[] = mongoResults.map((mongoResult) => {
        const pgResult = uniquePgResults.find((r) => r.id === mongoResult.vectorId);
        if (pgResult) {
          return {
            ...pgResult,
            id: mongoResult.dataId, // 使用 dataId 而不是 PG 的 vector id
            content: mongoResult.content,
            sourceName: mongoResult.sourceName,
            metadata: mongoResult.metadata ?? undefined
          };
        }
        // 如果 PG 找不到（不应该发生），返回 MongoDB 结果
        // 重要：使用 dataId 而不是 vectorId，与 MongoDB 全文检索保持一致
        return {
          id: mongoResult.dataId,
          content: mongoResult.content,
          score: 0,
          datasetId: '',
          collectionId: '',
          sourceName: mongoResult.sourceName,
          metadata: mongoResult.metadata ?? undefined
        };
      });

      return createSearchResult(enrichedResults, 'vector', 'fastgpt');
    } catch (error) {
      this.logger?.error('[FastGPTVectorSearch] Error:', {
        message: error instanceof Error ? error.message : String(error)
      });
      return createSearchResult([], 'vector', 'fastgpt');
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await Promise.all([
      this.pgAdapter.close().catch((e) =>
        this.logger?.error('[FastGPTVectorSearch] PG close error:', {
          message: e instanceof Error ? e.message : String(e)
        })
      ),
      this.mongoAdapter.close().catch((e) =>
        this.logger?.error('[FastGPTVectorSearch] MongoDB close error:', {
          message: e instanceof Error ? e.message : String(e)
        })
      )
    ]);
  }

  /**
   * 将向量补零到目标维度
   * FastGPT PG 存储 1536 维向量（bge-m3 输出 1024 维 + 补零）
   */
  private padVector(vector: number[], targetDim: number): number[] {
    if (vector.length >= targetDim) {
      return vector.slice(0, targetDim);
    }
    const padded = new Array(targetDim).fill(0);
    for (let i = 0; i < vector.length; i++) {
      padded[i] = vector[i];
    }
    return padded;
  }
}
