// src/adapters/built-in/pgvector/adapter.ts
// PGVector 向量检索适配器

import pg from 'pg';
import type {
  VectorSearchProvider,
  VectorSearchOptions,
  SearchResult
} from '../../../ports/search';
import { createSearchResult } from '../../../ports/search';
import type { ChunkResult } from '../../../types/chunk';
import type { Logger } from '../../../ports/logger';

const { Pool } = pg;

/**
 * PGVector 配置
 */
export interface PGVectorConfig {
  connectionString?: string;
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  tableName?: string;
  vectorDimension?: number;
  logger?: Logger;
}

/**
 * PGVector 向量检索器
 */
export class PGVectorAdapter implements VectorSearchProvider {
  public readonly type = 'pgvector' as const;

  private pool: pg.Pool;
  private tableName: string;
  private vectorDimension: number;
  private logger?: Logger;

  constructor(config: PGVectorConfig = {}) {
    const connectionString =
      config.connectionString ||
      `postgresql://${config.user || 'postgres'}:${config.password || 'password'}@${config.host || 'localhost'}:${config.port || 5432}/${config.database || 'postgres'}`;

    this.pool = new Pool({ connectionString });
    this.tableName = config.tableName || 'modeldata'; // FastGPT uses 'modeldata'
    this.vectorDimension = config.vectorDimension || 1536;
    this.logger = config.logger;
  }

  /**
   * 初始化表结构
   */
  async init(): Promise<void> {
    // 不需要初始化，FastGPT 的 PG 数据已存在
    this.logger?.info('PGVector adapter ready (no init needed)');
  }

  /**
   * 获取向量维度
   */
  getVectorDimension(): number {
    return this.vectorDimension;
  }

  /**
   * 直接向量检索（不补零）
   * 用原始向量维度查询，FastGPT PG 中实际存储的是 1024 维的向量
   */
  async searchDirect(
    vectors: number[][],
    datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    if (vectors.length === 0 || datasetIds.length === 0) {
      return createSearchResult([], 'vector', 'pgvector');
    }

    const vector = vectors[0];
    const limit = options.limit || 10;

    // 格式化禁止的 collectionId
    const forbidCollectionSql = options.filter?.forbidCollectionIds?.length
      ? `AND collection_id NOT IN (${options.filter.forbidCollectionIds.map((id: string) => `'${id}'`).join(',')})`
      : '';

    // 格式化过滤的 collectionId
    const filterCollectionIdSql = options.filter?.collectionIds?.length
      ? `AND collection_id IN (${options.filter.collectionIds.map((id: string) => `'${id}'`).join(',')})`
      : '';

    if (options.filter?.collectionIds && options.filter.collectionIds.length === 0) {
      return createSearchResult([], 'vector', 'pgvector');
    }

    const client = await this.pool.connect();
    try {
      const datasetIdsSql = datasetIds.map((id) => `'${String(id)}'`).join(',');
      const results: any = await client.query(
        `BEGIN;
          SET LOCAL hnsw.ef_search = 100;
          SET LOCAL hnsw.max_scan_tuples = 100000;
          SET LOCAL hnsw.iterative_scan = relaxed_order;
          WITH relaxed_results AS MATERIALIZED (
            SELECT id, collection_id, dataset_id,
                   vector <#> '[${vector.join(',')}]' AS ip_score
            FROM ${this.tableName}
            WHERE dataset_id IN (${datasetIdsSql})
              ${filterCollectionIdSql}
              ${forbidCollectionSql}
            ORDER BY ip_score
            LIMIT ${limit}
          ) SELECT id, collection_id, dataset_id, ip_score FROM relaxed_results ORDER BY ip_score;
        COMMIT;`
      );

      const rows: Array<{
        id: string;
        collection_id: string;
        dataset_id: string;
        ip_score: number;
      }> = results?.[results.length - 2]?.rows ?? [];

      // 计算分数范围用于规范化
      const scores = rows.map((r) => Math.abs(r.ip_score));
      const minScore = Math.min(...scores, 0);
      const maxScore = Math.max(...scores, 1);
      const scoreRange = maxScore - minScore || 1;

      const chunks = rows.map((row) => {
        // pgvector <#> 返回负的内积，转为正值后作为相似度
        const rawScore = Math.abs(row.ip_score);
        // 规范化到 0-1 范围
        const score = (rawScore - minScore) / scoreRange;

        return {
          id: String(row.id),
          content: '',
          score,
          vectorScore: score, // 保留原始向量相似度，防止被 RRF 覆盖后丢失
          datasetId: row.dataset_id,
          collectionId: row.collection_id,
          sourceName: '',
          metadata: undefined
        };
      });

      return createSearchResult(chunks, 'vector', 'pgvector');
    } finally {
      client.release();
    }
  }

  /**
   * 向量检索（原始方法，保持兼容性）
   * 返回的 score 是内积相似度（0-1 范围）
   * pgvector <#> 返回负的内积，取绝对值后作为相似度
   */
  async search(
    vectors: number[][],
    datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    // 使用直接查询
    return this.searchDirect(vectors, datasetIds, options);
  }

  /**
   * 关闭连接池
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}
