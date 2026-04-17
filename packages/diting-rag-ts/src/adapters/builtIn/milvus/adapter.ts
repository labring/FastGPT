// src/adapters/built-in/milvus/adapter.ts
// Milvus 向量检索适配器

import { MilvusClient, DataType, LoadState } from '@zilliz/milvus2-sdk-node';
import type {
  VectorSearchProvider,
  VectorSearchOptions,
  SearchResult
} from '../../../ports/search';
import { createSearchResult } from '../../../ports/search';
import type { ChunkResult } from '../../../types/chunk';
import type { Logger } from '../../../ports/logger';

/**
 * Milvus 配置
 */
export interface MilvusConfig {
  address: string;
  token?: string;
  database?: string;
  collectionName?: string;
  vectorDimension?: number;
  logger?: Logger;
}

/**
 * Milvus 向量检索器
 */
export class MilvusAdapter implements VectorSearchProvider {
  public readonly type = 'milvus' as const;

  private client: MilvusClient | null = null;
  private address: string;
  private token?: string;
  private database: string;
  private collectionName: string;
  private vectorDimension: number;
  private logger?: Logger;

  constructor(config: MilvusConfig) {
    this.address = config.address;
    this.token = config.token;
    this.database = config.database || 'default';
    this.collectionName = config.collectionName || 'dataset_vectors';
    this.vectorDimension = config.vectorDimension || 1536;
    this.logger = config.logger;
  }

  /**
   * 获取客户端
   */
  private async getClient(): Promise<MilvusClient> {
    if (this.client) return this.client;

    this.client = new MilvusClient({
      address: this.address,
      token: this.token
    });

    // 等待连接建立
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    return this.client;
  }

  /**
   * 初始化集合
   */
  async init(): Promise<void> {
    const client = await this.getClient();

    // 创建数据库
    try {
      const { db_names } = await client.listDatabases();
      if (!db_names.includes(this.database)) {
        await client.createDatabase({ db_name: this.database });
      }
      await client.useDatabase({ db_name: this.database });
    } catch (error) {
      // 数据库可能已存在
      this.logger?.warn('Milvus database init warning:', {
        message: error instanceof Error ? error.message : String(error)
      });
    }

    // 检查集合是否存在
    const { value: hasCollection } = await client.hasCollection({
      collection_name: this.collectionName
    });

    if (!hasCollection) {
      // 创建集合
      await client.createCollection({
        collection_name: this.collectionName,
        description: 'Store dataset vector',
        enableDynamicField: true,
        fields: [
          {
            name: 'id',
            data_type: DataType.Int64,
            is_primary_key: true,
            autoID: false
          },
          {
            name: 'vector',
            data_type: DataType.FloatVector,
            dim: this.vectorDimension
          },
          { name: 'teamId', data_type: DataType.VarChar, max_length: 64 },
          { name: 'datasetId', data_type: DataType.VarChar, max_length: 64 },
          { name: 'collectionId', data_type: DataType.VarChar, max_length: 64 },
          { name: 'content', data_type: DataType.VarChar, max_length: 65535 },
          { name: 'sourceName', data_type: DataType.VarChar, max_length: 500 },
          { name: 'metadata', data_type: DataType.VarChar, max_length: 65535 },
          {
            name: 'createTime',
            data_type: DataType.Int64
          }
        ],
        index_params: [
          {
            field_name: 'vector',
            index_name: 'vector_HNSW',
            index_type: 'HNSW',
            metric_type: 'IP',
            params: { efConstruction: 32, M: 64 }
          },
          {
            field_name: 'teamId',
            index_type: 'Trie'
          },
          {
            field_name: 'datasetId',
            index_type: 'Trie'
          },
          {
            field_name: 'collectionId',
            index_type: 'Trie'
          },
          {
            field_name: 'createTime',
            index_type: 'STL_SORT'
          }
        ]
      });

      this.logger?.info(`Milvus collection '${this.collectionName}' created`);
    }

    // 加载集合到内存
    const { state: colLoadState } = await client.getLoadState({
      collection_name: this.collectionName
    });

    if (
      colLoadState === LoadState.LoadStateNotExist ||
      colLoadState === LoadState.LoadStateNotLoad
    ) {
      await client.loadCollectionSync({
        collection_name: this.collectionName
      });
      this.logger?.info(`Milvus collection '${this.collectionName}' loaded`);
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): number {
    const firstDigit = Math.floor(Math.random() * 8) + 1;
    const restDigits = Math.floor(Math.random() * 10 ** 15);
    return Number(`${firstDigit}${restDigits}`);
  }

  /**
   * 插入向量
   */
  async insertVectors(options: {
    vectors: number[][];
    datasetId: string;
    collectionId: string;
    teamId?: string;
    contents?: string[];
    sourceNames?: string[];
    metadata?: Record<string, unknown>[];
  }): Promise<string[]> {
    const client = await this.getClient();
    const { vectors, datasetId, collectionId, teamId, contents, sourceNames, metadata } = options;

    const data = vectors.map((vector, i) => ({
      id: this.generateId(),
      vector,
      teamId: String(teamId || ''),
      datasetId: String(datasetId),
      collectionId: String(collectionId),
      content: contents?.[i] || '',
      sourceName: sourceNames?.[i] || '',
      metadata: metadata?.[i] ? JSON.stringify(metadata[i]) : '',
      createTime: Date.now()
    }));

    const result = await client.insert({
      collection_name: this.collectionName,
      data
    });

    if ('int_id' in result.IDs) {
      return result.IDs.int_id.data.map((id) => String(id));
    }
    return result.IDs.str_id.data.map((id) => String(id));
  }

  /**
   * 删除向量
   */
  async deleteVectors(options: {
    ids?: string[];
    datasetIds?: string[];
    collectionIds?: string[];
    teamId?: string;
  }): Promise<void> {
    const client = await this.getClient();
    const { ids, datasetIds, collectionIds, teamId } = options;

    let where = '';

    if (teamId) {
      where = `(teamId == "${teamId}")`;
    }

    if (ids && ids.length > 0) {
      const idsFilter = `(id in [${ids.join(',')}])`;
      where = where ? `${where} and ${idsFilter}` : idsFilter;
    }

    if (datasetIds && datasetIds.length > 0) {
      const datasetFilter = `(datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}])`;
      where = where ? `${where} and ${datasetFilter}` : datasetFilter;
    }

    if (collectionIds && collectionIds.length > 0) {
      const collectionFilter = `(collectionId in [${collectionIds.map((id) => `"${id}"`).join(',')}])`;
      where = where ? `${where} and ${collectionFilter}` : collectionFilter;
    }

    if (!where) return;

    await client.delete({
      collection_name: this.collectionName,
      filter: where
    });
  }

  /**
   * 向量检索
   */
  async search(
    vectors: number[][],
    datasetIds: string[],
    options: VectorSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    if (vectors.length === 0 || datasetIds.length === 0) {
      return createSearchResult([], 'vector', 'milvus');
    }

    const vector = vectors[0];
    const limit = options.limit || 10;

    // 格式化禁止的 collectionId
    const forbidCollectionQuery = options.filter?.forbidCollectionIds?.length
      ? `and (collectionId not in [${options.filter.forbidCollectionIds.map((id: string) => `"${id}"`).join(',')}])`
      : '';

    // 格式化过滤的 collectionId
    const collectionIdQuery = options.filter?.collectionIds?.length
      ? `and (collectionId in [${options.filter.collectionIds.map((id: string) => `"${id}"`).join(',')}])`
      : '';

    // 如果过滤条件为空，返回空结果
    if (options.filter?.collectionIds && options.filter.collectionIds.length === 0) {
      return createSearchResult([], 'vector', 'milvus');
    }

    const client = await this.getClient();

    const filterStr =
      `(datasetId in [${datasetIds.map((id) => `"${id}"`).join(',')}]) ${collectionIdQuery} ${forbidCollectionQuery}`.trim();

    const searchResult = await client.search({
      collection_name: this.collectionName,
      data: [vector],
      limit,
      expr: filterStr,
      output_fields: ['collectionId', 'content', 'sourceName', 'metadata', 'datasetId']
    });

    const rows = (searchResult.results || []) as Array<{
      score: number;
      id: string;
      collectionId: string;
      content: string;
      sourceName: string;
      metadata: string;
      datasetId: string;
    }>;

    const chunks = rows.map((item) => ({
      id: String(item.id),
      content: item.content || '',
      score: item.score,
      datasetId: item.datasetId,
      collectionId: item.collectionId,
      sourceName: item.sourceName || '',
      metadata: item.metadata ? JSON.parse(item.metadata) : undefined
    }));

    return createSearchResult(chunks, 'vector', 'milvus');
  }

  /**
   * 获取向量数量
   */
  async getCount(options: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
  }): Promise<number> {
    const client = await this.getClient();

    const filterConditions: string[] = [];

    if (options.teamId) {
      filterConditions.push(`(teamId == "${options.teamId}")`);
    }

    if (options.datasetId) {
      filterConditions.push(`(datasetId == "${options.datasetId}")`);
    }

    if (options.collectionId) {
      filterConditions.push(`(collectionId == "${options.collectionId}")`);
    }

    const filter = filterConditions.length > 0 ? filterConditions.join(' and ') : '';

    const result = await client.query({
      collection_name: this.collectionName,
      output_fields: ['count(*)'],
      filter: filter || undefined
    });

    return Number(result.data?.[0]?.['count(*)'] || 0);
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.closeConnection();
      this.client = null;
    }
  }
}
