// src/adapters/built-in/mongodb/adapter.ts
// MongoDB 全文检索适配器

import type { Db, Collection, Filter } from 'mongodb';
import { MongoClient, ObjectId } from 'mongodb';
import type {
  FullTextSearchProvider,
  FullTextSearchOptions,
  SearchResult
} from '../../../ports/search';
import { createSearchResult } from '../../../ports/search';
import type { ChunkResult } from '../../../types/chunk';
import { jiebaSplitForSearch } from '../../../utils/jieba';
import type { Logger } from '../../../ports/logger';

/**
 * MongoDB 配置
 */
export interface MongoDBConfig {
  connectionString?: string;
  database?: string;
  collectionName?: string;
  logger?: Logger;
}

/**
 * dataset_data_texts 文档结构（FastGPT 全文检索专用集合）
 * 建有 text index on fullTextToken，default_language: 'none'（依赖 jieba 预分词）
 */
interface DatasetDataTextDocument {
  _id: unknown;
  teamId: unknown;
  datasetId: unknown;
  collectionId: unknown;
  dataId: unknown; // 对应 dataset_datas._id
  fullTextToken: string; // jieba 分词结果（空格分隔）
}

/**
 * MongoDB 文档结构 - 匹配 FastGPT dataset_collections
 */
interface DatasetCollectionDocument {
  _id: string;
  name?: string;
  fileId?: string;
  rawLink?: string;
  externalFileId?: string;
  externalFileUrl?: string;
  apiFileId?: string;
}

/**
 * MongoDB 文档结构 - 匹配 FastGPT dataset_datas
 */
interface DatasetDocument {
  _id: string;
  teamId?: string;
  datasetId: string;
  collectionId: string;
  q: string; // 主内容 (FastGPT 字段)
  a?: string; // 补充内容
  metadata?: Record<string, unknown>;
  indexes?: Array<{ dataId: string; text: string }>; // 向量索引
  chunkIndex?: number;
  createTime?: number;
}

/**
 * MongoDB 全文检索器
 */
export class MongoDBAdapter implements FullTextSearchProvider {
  public readonly type = 'mongodb' as const;

  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<DatasetDocument> | null = null;

  private connectionString: string;
  private database: string;
  private collectionName: string;
  private logger?: Logger;

  constructor(config: MongoDBConfig = {}) {
    this.connectionString =
      config.connectionString || process.env.MONGODB_URI || 'mongodb://localhost:27017';
    this.database = config.database || process.env.MONGODB_DATABASE || 'fastgpt';
    this.collectionName = config.collectionName || 'dataset_datas';
    this.logger = config.logger;
  }

  /**
   * 连接数据库
   */
  private async connect(): Promise<{ db: Db; collection: Collection<DatasetDocument> }> {
    if (this.db && this.collection) {
      return { db: this.db, collection: this.collection };
    }

    this.client = new MongoClient(this.connectionString);
    await this.client.connect();

    this.db = this.client.db(this.database);
    this.collection = this.db.collection<DatasetDocument>(this.collectionName);

    return { db: this.db, collection: this.collection };
  }

  /**
   * 初始化
   */
  async init(): Promise<void> {
    await this.connect();
    this.logger?.info(`MongoDB adapter initialized. ${this.connectionString}`);
  }

  /**
   * 插入文档
   */
  async insertDocuments(options: {
    datasetId: string;
    collectionId: string;
    teamId?: string;
    contents: string[];
    sourceNames?: string[];
    metadata?: Record<string, unknown>[];
  }): Promise<string[]> {
    const { collection } = await this.connect();
    const { datasetId, collectionId, teamId, contents, metadata } = options;

    const documents: DatasetDocument[] = contents.map((content, i) => ({
      _id: '',
      teamId: teamId,
      datasetId: datasetId,
      collectionId: collectionId,
      q: content, // FastGPT 字段
      a: undefined,
      metadata: metadata?.[i],
      createTime: Date.now()
    }));

    const result = await collection.insertMany(documents);
    return Object.values(result.insertedIds).map((id) => String(id));
  }

  /**
   * 删除文档
   */
  async deleteDocuments(options: {
    ids?: string[];
    datasetIds?: string[];
    collectionIds?: string[];
    teamId?: string;
  }): Promise<void> {
    const { collection } = await this.connect();
    const { ids, datasetIds, collectionIds, teamId } = options;

    const filter: Record<string, unknown> = {};

    if (ids && ids.length > 0) {
      filter._id = { $in: ids };
    }

    if (datasetIds && datasetIds.length > 0) {
      filter.datasetId = { $in: datasetIds };
    }

    if (collectionIds && collectionIds.length > 0) {
      filter.collectionId = { $in: collectionIds };
    }

    if (teamId) {
      filter.teamId = teamId;
    }

    if (Object.keys(filter).length === 0) return;

    await collection.deleteMany(filter);
  }

  /**
   * 全文检索
   */
  async search(
    query: string,
    datasetIds: string[],
    options: FullTextSearchOptions
  ): Promise<SearchResult<ChunkResult>> {
    // console.log('[MongoDB] search called with:', { datasetIds, query: query?.slice(0, 50), limit: options.limit });
    this.logger?.debug('[MongoDB] search called with:', {
      datasetIds,
      query: query?.slice(0, 50),
      limit: options.limit
    });

    const { db, collection } = await this.connect();
    const limit = options.limit || 10;

    if (!query) {
      return createSearchResult([], 'fulltext', 'mongodb');
    }

    // jieba 分词（搜索模式），与 FastGPT 存储的 fullTextToken 格式一致
    const searchText = jiebaSplitForSearch(query) || query;

    // Step 1: 在 dataset_data_texts 集合上做 $text 搜索（FastGPT 全文检索集合）
    // text index 是复合索引 { teamId: 1, fullTextToken: 'text' }，必须提供 teamId 前缀
    const dataTextColl = db.collection<DatasetDataTextDocument>('dataset_data_texts');
    const datasetObjectIds = datasetIds.map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return id;
      }
    });

    // 通过 datasetId 找一条文档获取 teamId（复合 text index 的必要前缀条件）
    const sampleDoc = await dataTextColl.findOne({ datasetId: { $in: datasetObjectIds } });
    if (!sampleDoc) {
      this.logger?.warn('[MongoDB] No documents found for given datasetIds in dataset_data_texts');
      return createSearchResult([], 'fulltext', 'mongodb');
    }
    const teamId = sampleDoc.teamId;

    let textResults: Array<DatasetDataTextDocument & { score: number }> = [];
    try {
      textResults = await dataTextColl
        .aggregate<DatasetDataTextDocument & { score: number }>([
          {
            $match: {
              teamId,
              $text: { $search: searchText },
              datasetId: { $in: datasetObjectIds }
            }
          },
          { $sort: { score: { $meta: 'textScore' } } },
          { $limit: limit },
          { $project: { _id: 1, collectionId: 1, dataId: 1, score: { $meta: 'textScore' } } }
        ])
        .toArray();
    } catch (e) {
      this.logger?.warn('[MongoDB] dataset_data_texts $text search failed:', {
        message: e instanceof Error ? e.message : String(e)
      });
      return createSearchResult([], 'fulltext', 'mongodb');
    }

    this.logger?.debug('[MongoDB] dataset_data_texts results:', { count: textResults.length });
    if (textResults.length === 0) return createSearchResult([], 'fulltext', 'mongodb');

    // Step 2: 通过 dataId 回查 dataset_datas 拿内容
    const dataIds = textResults.map((r) => r.dataId as ObjectId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dataDocs = await collection.find({ _id: { $in: dataIds } } as any).toArray();
    const dataMap = new Map(dataDocs.map((d) => [String(d._id), d]));

    const chunks = textResults
      .map((textDoc, idx) => {
        const data = dataMap.get(String(textDoc.dataId));
        if (!data) return null;
        return {
          id: String(data._id),
          content: (data.q || '') + (data.a ? '\n' + data.a : ''),
          score: textResults[idx]?.score ?? 1,
          datasetId: String(textDoc.datasetId),
          collectionId: String(textDoc.collectionId),
          sourceName: (data.metadata?.sourceName as string) || '',
          metadata: data.metadata
        } as ChunkResult;
      })
      .filter((r): r is ChunkResult => r !== null);

    return createSearchResult(chunks, 'fulltext', 'mongodb');
  }

  /**
   * 获取文档数量
   */
  async getCount(options: {
    teamId?: string;
    datasetId?: string;
    collectionId?: string;
  }): Promise<number> {
    const { collection } = await this.connect();

    const filter: Record<string, unknown> = {};

    if (options.teamId) {
      filter.teamId = options.teamId;
    }

    if (options.datasetId) {
      filter.datasetId = options.datasetId;
    }

    if (options.collectionId) {
      filter.collectionId = options.collectionId;
    }

    return collection.countDocuments(filter);
  }

  /**
   * 列出 FastGPT datasets 集合中的所有数据集（用于调试）
   */
  async listDatasets(): Promise<Array<{ id: string; name: string }>> {
    const { db } = await this.connect();
    try {
      const datasets = await db
        .collection('datasets')
        .find({}, { projection: { _id: 1, name: 1 } })
        .toArray();
      return datasets.map((d) => ({ id: String(d._id), name: String(d.name || '') }));
    } catch {
      return [];
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }

  /**
   * 根据 vector IDs (PG row IDs) 查询 MongoDB 获取内容
   * FastGPT 中 vector id 存储在 dataset_datas.indexes[].dataId 中
   * 参考: FastGPT packages/service/core/dataset/search/base.ts
   * 重点：按内容 (dataId) 去重，而不是按 vectorId，因为多个 vector ID 可能指向同一内容
   * sourceName 需要从 collections 表获取（参考 getCollectionSourceData）
   */
  async lookupByContentIds(
    vectorIds: string[],
    collectionIds: string[],
    datasetIds?: string[]
  ): Promise<
    Array<{
      vectorId: string;
      dataId: string;
      content: string;
      sourceName: string;
      metadata: Record<string, unknown> | undefined;
    }>
  > {
    const { db, collection } = await this.connect();

    if (vectorIds.length === 0 || collectionIds.length === 0) {
      return [];
    }

    // 将 string datasetIds 转换为 MongoDB ObjectId (可选)
    let datasetObjectIds: (ObjectId | string)[] | undefined;
    if (datasetIds && datasetIds.length > 0) {
      datasetObjectIds = datasetIds.map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return id;
        }
      });
    }

    // ⚡ 优化：将 vectorIds 转换为 Set，提升查询效率 O(1)
    const vectorIdSet = new Set(vectorIds);

    // 构建查询条件 - 只用 vectorIds 查询，collectionId 和 datasetId 在内存中过滤
    // 原因: MongoDB 文档中 collectionId/datasetId 存储为 ObjectId，但传入的是字符串
    // 同时尝试 ObjectId 和字符串两种格式
    const vectorIdObjectIds = vectorIds.map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return id;
      }
    });
    const query: Record<string, unknown> = {
      $or: [
        { 'indexes.dataId': { $in: vectorIds } },
        { 'indexes.dataId': { $in: vectorIdObjectIds } }
      ]
    };

    // 添加 datasetId 过滤（如果提供了的话）- MongoDB 可以直接用 ObjectId 比较
    if (datasetObjectIds && datasetObjectIds.length > 0) {
      query.datasetId = { $in: datasetObjectIds };
    }

    const docs = await collection.find(query).toArray();

    // 在内存中根据传入的 collectionIds 过滤文档
    // 注意: MongoDB 文档中的 collectionId 是 ObjectId，传入的是字符串
    const collectionIdSet = new Set(collectionIds.map((id) => String(id).toLowerCase()));
    const filteredDocs = docs.filter((doc) => {
      const docCollectionId = String(doc.collectionId).toLowerCase();
      return collectionIdSet.has(docCollectionId);
    });

    // 构建映射：vectorId -> { dataId, content, metadata, collectionId }
    // 关键：一个 dataId 对应一个内容，多个 vectorId 可能指向同一个 dataId
    const vectorIdToDataIdMap = new Map<string, string>();
    const dataIdToContentMap = new Map<
      string,
      { content: string; collectionId: string; metadata: Record<string, unknown> | undefined }
    >();

    let matchedVectorIds = 0;
    for (const doc of filteredDocs) {
      const docCollectionId = String(doc.collectionId);
      if (doc.indexes && Array.isArray(doc.indexes)) {
        for (const idx of doc.indexes) {
          const vid = String(idx.dataId);
          if (vectorIdSet.has(vid)) {
            vectorIdToDataIdMap.set(vid, String(doc._id));
            // 同时保存 collectionId，用于后续查 collections 表
            if (!dataIdToContentMap.has(String(doc._id))) {
              dataIdToContentMap.set(String(doc._id), {
                content: (doc.q || '') + (doc.a ? '\n' + doc.a : ''),
                collectionId: docCollectionId,
                metadata: doc.metadata ?? undefined
              });
            }
            matchedVectorIds++;
          }
        }
      }
    }

    // 获取所有涉及的 collectionId，查询 collections 表获取 sourceName
    const uniqueCollectionIds = [
      ...new Set(
        filteredDocs
          .map((doc) => String(doc.collectionId))
          .filter((id) => collectionIdSet.has(id.toLowerCase()))
      )
    ];

    const collectionMap = new Map<string, string>(); // collectionId -> sourceName
    if (uniqueCollectionIds.length > 0) {
      try {
        const collectionsColl = db.collection<DatasetCollectionDocument>('dataset_collections');
        // 分离可以转换为 ObjectId 的 ID 和字符串 ID
        const objectIds: ObjectId[] = [];
        const stringIds: string[] = [];
        for (const id of uniqueCollectionIds) {
          try {
            objectIds.push(new ObjectId(id));
          } catch {
            stringIds.push(id);
          }
        }
        // 分别查询
        const filter: Filter<DatasetCollectionDocument>[] = [];
        if (objectIds.length > 0) filter.push({ _id: { $in: objectIds as unknown as string[] } });
        if (stringIds.length > 0) filter.push({ _id: { $in: stringIds } });
        const queryFilter = filter.length === 1 ? filter[0] : { $or: filter };

        const collectionDocs = await collectionsColl
          .find(queryFilter, {
            projection: {
              _id: 1,
              name: 1,
              fileId: 1,
              rawLink: 1,
              externalFileId: 1,
              externalFileUrl: 1,
              apiFileId: 1
            }
          })
          .toArray();

        for (const coll of collectionDocs) {
          const cid = String(coll._id);
          // 优先使用 name，其次使用 fileId/rawLink/externalFileId/externalFileUrl/apiFileId
          const sourceName =
            coll.name ||
            String(
              coll.fileId ||
                coll.rawLink ||
                coll.externalFileId ||
                coll.externalFileUrl ||
                coll.apiFileId ||
                ''
            );
          collectionMap.set(cid, sourceName);
        }
      } catch (e) {
        this.logger?.warn('[MongoDB] lookupByContentIds: query collections failed:', {
          message: e instanceof Error ? e.message : String(e)
        });
      }
    }

    // 按 vectorIds 顺序返回结果，但按 dataId 去重
    // 重点：多个 vectorId 指向同一 dataId 时，只返回一条
    const seenDataIds = new Set<string>();
    const results = vectorIds
      .map((vid) => {
        const dataId = vectorIdToDataIdMap.get(vid);
        if (!dataId || seenDataIds.has(dataId)) {
          return null;
        }
        seenDataIds.add(dataId);
        const content = dataIdToContentMap.get(dataId);
        if (!content) {
          return null;
        }
        // 从 collectionMap 获取 sourceName
        const sourceName = collectionMap.get(content.collectionId) || '';
        return {
          vectorId: vid,
          dataId,
          content: content.content,
          sourceName,
          metadata: content.metadata
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    return results;
  }
}
