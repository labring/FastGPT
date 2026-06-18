/**
 * 知识库检索公共能力
 *
 * 本文件提取检索系统的公共技术能力，供 Controller、Provider、Agentic 等模块复用
 * 不包含任何业务逻辑（App 级别的 correction/faq 优先），只提供纯技术能力
 */

import { Types } from '../../../common/mongo';
import { recallFromVectorStore } from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getDefaultRerankModel, getEmbeddingModelById } from '../../ai/model';
import { reRankRecall } from '../../../core/ai/rerank';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetCollection } from '../collection/schema';
import { MongoDatasetDataText } from '../data/dataTextSchema';
import { formatDatasetDataValue } from '../data/controller';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import { hashStr } from '@fastgpt/global/common/string/tools';
import { jiebaSplit, jiebaSplitWithCustomDict } from '../../../common/string/jieba/index';
import { readFromSecondary } from '../../../common/mongo/utils';
import type { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import type { DatasetDataSchemaType } from '@fastgpt/global/core/dataset/type';
import type { DatasetCollectionSchemaType } from '@fastgpt/global/core/dataset/type';
import type { DatasetDataTextSchemaType } from '@fastgpt/global/core/dataset/type';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { addLog } from '../../../common/system/log';
import { extractChunkSynonyms } from './synonym';
import { MongoDatasetSynonymMapping } from '../synonym/mappingSchema';
import { MILVUS_ADDRESS, PG_ADDRESS, OCEANBASE_ADDRESS } from '../../../common/vectorDB/constants';
import { MilvusCtrl } from '../../../common/vectorDB/milvus/index';
import { milvusVersionManager } from '../../../common/vectorDB/milvus/version';

/* ==================== 类型定义 ==================== */

export interface RecallOptions {
  teamId: string;
  datasetIds: string[];
  queries: string[];
  modelId: string;
  limit: number;
  forbidCollectionIdList?: string[];
  filterCollectionIdList?: string[];
  searchMode?: `${DatasetSearchModeEnum}`;
  customWords?: string[];
  /** 预计算向量，提供时跳过 getVectorsByText 步骤，直接用于向量检索 */
  precomputedVectors?: number[][];
}

export interface MultiQueryRecallResult {
  results: SearchDataResponseItemType[][];
  tokens: number;
}

export interface RecallResult {
  results: SearchDataResponseItemType[];
  tokens: number;
}

export interface MixedRecallOptions extends RecallOptions {
  embeddingWeight?: number;
  usingReRank?: boolean;
  rerankModel?: RerankModelItemType;
  similarity?: number;
  rerankMethod?: any;
  rerankWeight?: number;
}

export interface MixedRecallResult extends RecallResult {
  usingReRank: boolean;
  rerankTime?: number;
  retrievalTime?: number;
}

/* ==================== 同义词词汇表 ==================== */

/**
 * 获取多个知识库的全部同义词词汇，作为 jieba 自定义词表
 */
export async function getAllDatasetsSynonymWords(
  teamId: string,
  datasetIds: string[]
): Promise<string[]> {
  if (!datasetIds || datasetIds.length === 0) {
    return [];
  }

  try {
    const allMappings = await MongoDatasetSynonymMapping.find(
      {
        teamId: new Types.ObjectId(teamId),
        datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) }
      },
      'standardizedTerm synonymTerms'
    ).lean();

    const synonymWords = new Set<string>();

    allMappings.forEach((mapping) => {
      if (mapping.standardizedTerm) {
        synonymWords.add(mapping.standardizedTerm);
      }
      if (mapping.synonymTerms && Array.isArray(mapping.synonymTerms)) {
        mapping.synonymTerms.forEach((term) => {
          if (term) synonymWords.add(term);
        });
      }
    });

    const result = Array.from(synonymWords);
    addLog.debug('getAllDatasetsSynonymWords', {
      datasetCount: datasetIds.length,
      totalSynonymWords: result.length,
      words: result.slice(0, 10)
    });

    return result;
  } catch (error) {
    addLog.error('getAllDatasetsSynonymWords error', {
      datasetIds,
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

/* ==================== 向量检索 ==================== */

/**
 * 向量检索
 * 将查询文本向量化后，从向量数据库检索相似文档
 */
export async function embeddingRecall(options: RecallOptions): Promise<RecallResult> {
  const {
    teamId,
    datasetIds,
    queries,
    modelId,
    limit,
    forbidCollectionIdList = [],
    filterCollectionIdList,
    precomputedVectors
  } = options;

  // 若调用方已预先计算向量（如 VectorSearchProvider），跳过 embedding 步骤
  let vectors: number[][];
  let tokens: number;

  if (precomputedVectors && precomputedVectors.length > 0) {
    vectors = precomputedVectors;
    tokens = 0;
  } else {
    const vectorModel = getEmbeddingModelById(modelId);
    const result = await getVectorsByText({
      model: vectorModel,
      input: queries,
      type: 'query'
    });
    vectors = result.vectors;
    tokens = result.tokens;
  }

  // 并行对每个向量执行检索
  const recallResults = await Promise.all(
    vectors.map(async (vector) => {
      return await recallFromVectorStore({
        teamId,
        datasetIds,
        vector,
        limit,
        forbidCollectionIdList,
        filterCollectionIdList
      });
    })
  );

  // 获取数据集和 collection 信息
  const collectionIdList = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.collectionId)).flat())
  );
  const indexDataIds = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.id?.trim()).flat()).flat())
  );

  addLog.debug(
    `[embeddingRecall] PG returned: indexDataIds=${indexDataIds.length}, collectionIds=${collectionIdList.length}`
  );
  if (indexDataIds.length > 0) {
    addLog.debug(`[embeddingRecall] sample indexDataIds: ${indexDataIds.slice(0, 3).join(', ')}`);
    addLog.debug(
      `[embeddingRecall] sample collectionIds: ${collectionIdList.slice(0, 3).join(', ')}`
    );
  }

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIdList },
        'indexes.dataId': { $in: indexDataIds }
      },
      datasetDataSelectField,
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => {
          item.indexes.forEach((index) => {
            if (indexDataIds.includes(index.dataId)) {
              map.set(String(index.dataId), item);
            }
          });
        });
        addLog.debug(
          `[embeddingRecall] MongoDB DatasetData: docs=${res.length}, indexMap=${map.size} (pgIds=${indexDataIds.length}, collIds=${collectionIdList.length})`
        );
        return map;
      }),
    MongoDatasetCollection.find({ _id: { $in: collectionIdList }, deleteTime: null }, datasetCollectionSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => {
          map.set(String(item._id), item);
        });
        addLog.debug(`[embeddingRecall] MongoDB Collection: found=${res.length}`);
        return map;
      })
  ]);

  // 转换结果
  const results = recallResults
    .map((item) => item.results)
    .flat()
    .map((item, index) => {
      const collection = collectionMaps.get(String(item.collectionId));
      const data = dataMaps.get(String(item.id));

      if (!collection || !data) return null;

      return {
        id: String(data._id),
        updateTime: data.updateTime,
        ...formatDatasetDataValue({
          q: data.q,
          a: data.a,
          imageId: data.imageId,
          imageDescMap: data.imageDescMap
        }),
        chunkIndex: data.chunkIndex,
        datasetId: String(data.datasetId),
        collectionId: String(data.collectionId),
        ...getCollectionSourceData(collection),
        score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }],
        metadata: data.metadata
      } as SearchDataResponseItemType;
    })
    .filter((item): item is SearchDataResponseItemType => item !== null);

  // 去重
  const set = new Set<string>();
  const dedupedResults = results.filter((item) => {
    if (set.has(item.id)) return false;
    set.add(item.id);
    return true;
  });

  return {
    results: dedupedResults,
    tokens
  };
}

/**
 * 向量检索（多查询版，返回 per-query 2D 结果）
 * 每个 query 单独召回，保留 per-query 维度，供 controller 做第一层 RRF
 * 同时提取 synonymMappings
 */
export async function embeddingRecallPerQuery(
  options: RecallOptions
): Promise<MultiQueryRecallResult> {
  const {
    teamId,
    datasetIds,
    queries,
    modelId,
    limit,
    forbidCollectionIdList = [],
    filterCollectionIdList
  } = options;

  if (limit === 0) {
    return { results: [], tokens: 0 };
  }

  const vectorModel = getEmbeddingModelById(modelId);

  const { vectors, tokens } = await getVectorsByText({
    model: vectorModel,
    input: queries,
    type: 'query'
  });

  const recallResults = await Promise.all(
    vectors.map(async (vector) => {
      return await recallFromVectorStore({
        teamId,
        datasetIds,
        vector,
        limit,
        forbidCollectionIdList,
        filterCollectionIdList
      });
    })
  );

  const collectionIdList = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.collectionId)).flat())
  );
  const indexDataIds = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.id?.trim())).flat())
  );

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find(
      {
        teamId,
        datasetId: { $in: datasetIds },
        collectionId: { $in: collectionIdList },
        'indexes.dataId': { $in: indexDataIds }
      },
      datasetDataSelectField,
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => {
          item.indexes.forEach((index) => {
            if (indexDataIds.includes(index.dataId)) {
              map.set(String(index.dataId), item);
            }
          });
        });
        return map;
      }),
    MongoDatasetCollection.find({ _id: { $in: collectionIdList }, deleteTime: null }, datasetCollectionSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => {
          map.set(String(item._id), item);
        });
        return map;
      })
  ]);

  // 每个 query 独立转换结果，保留 2D 结构
  const results = recallResults.map((queryResult) => {
    const set = new Set<string>();
    return (
      queryResult.results
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            console.log('Collection is not found', item);
            return null;
          }
          const data = dataMaps.get(String(item.id));
          if (!data) {
            console.log('Data is not found', item);
            return null;
          }

          // 提取该 chunk 的同义词映射
          const synonymMappings = extractChunkSynonyms(data, String(item.id));

          return {
            id: String(data._id),
            updateTime: data.updateTime,
            ...formatDatasetDataValue({
              q: data.q,
              a: data.a,
              imageId: data.imageId,
              imageDescMap: data.imageDescMap
            }),
            chunkIndex: data.chunkIndex,
            datasetId: String(data.datasetId),
            collectionId: String(data.collectionId),
            ...getCollectionSourceData(collection),
            score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }],
            metadata: data.metadata,
            synonymMappings: synonymMappings.length > 0 ? synonymMappings : undefined
          } as SearchDataResponseItemType;
        })
        // 同一路召回中每个 data id 只保留一份（取最高排名）
        .filter((item): item is SearchDataResponseItemType => {
          if (!item) return false;
          if (set.has(item.id)) return false;
          set.add(item.id);
          return true;
        })
        .map((item, index) => ({
          ...item,
          score: item.score.map((s) => ({ ...s, index }))
        }))
    );
  });

  return { results, tokens };
}

/* ==================== 全文检索 ==================== */

/**
 * 全文检索
 * 使用全文索引（MongoDB text 或 Milvus BM25）检索文档
 */
export async function fullTextRecall(options: RecallOptions): Promise<RecallResult> {
  const {
    teamId,
    datasetIds,
    queries,
    limit,
    forbidCollectionIdList = [],
    filterCollectionIdList
  } = options;

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  // 并行对每个查询执行全文检索
  const recallResults = await Promise.all(
    queries.map(async (query) => {
      return (await MongoDatasetDataText.aggregate(
        [
          {
            $match: {
              teamId: new Types.ObjectId(teamId),
              $text: { $search: await jiebaSplit({ text: query }) },
              datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
              ...(filterCollectionIdList
                ? {
                    collectionId: {
                      $in: filterCollectionIdList
                        .filter((id) => !forbidCollectionIdList.includes(id))
                        .map((id) => new Types.ObjectId(id))
                    }
                  }
                : forbidCollectionIdList?.length
                  ? {
                      collectionId: {
                        $nin: forbidCollectionIdList.map((id) => new Types.ObjectId(id))
                      }
                    }
                  : {})
            }
          },
          {
            $sort: {
              score: { $meta: 'textScore' }
            }
          },
          {
            $limit: limit
          },
          {
            $project: {
              _id: 1,
              collectionId: 1,
              dataId: 1,
              score: { $meta: 'textScore' }
            }
          }
        ],
        {
          ...readFromSecondary
        }
      )) as (DatasetDataTextSchemaType & { score: number })[];
    })
  );

  const dataIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.dataId)).flat())
  );
  const collectionIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
  );

  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find({ _id: { $in: dataIds } }, datasetDataSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => {
          map.set(String(item._id), item);
        });
        return map;
      }),
    MongoDatasetCollection.find({ _id: { $in: collectionIds }, deleteTime: null }, datasetCollectionSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => {
          map.set(String(item._id), item);
        });
        return map;
      })
  ]);

  // 转换结果
  const results = recallResults
    .map((item) => item)
    .flat()
    .map((item, index) => {
      const collection = collectionMaps.get(String(item.collectionId));
      const data = dataMaps.get(String(item.dataId));

      if (!collection || !data) return null;

      return {
        id: String(data._id),
        datasetId: String(data.datasetId),
        collectionId: String(data.collectionId),
        updateTime: data.updateTime,
        ...formatDatasetDataValue({
          q: data.q,
          a: data.a,
          imageId: data.imageId,
          imageDescMap: data.imageDescMap
        }),
        chunkIndex: data.chunkIndex,
        metadata: data.metadata,
        ...getCollectionSourceData(collection),
        score: [
          {
            type: SearchScoreTypeEnum.fullText,
            value: item.score || 0,
            index
          }
        ]
      } as SearchDataResponseItemType;
    })
    .filter((item): item is SearchDataResponseItemType => item !== null);

  return {
    results,
    tokens: 0 // 全文检索不消耗 embedding tokens
  };
}

/* ==================== 全文检索（多查询 / 生产版） ==================== */

/**
 * Milvus 2.6+ BM25 全文检索（多查询，返回 2D per-query 结果）
 */
export async function fullTextRecallFromMilvus(options: {
  teamId: string;
  datasetIds: string[];
  queries: string[];
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
}): Promise<{ results: SearchDataResponseItemType[][] }> {
  const { teamId, datasetIds, queries, limit, forbidCollectionIdList, filterCollectionIdList } =
    options;

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  const milvusCtrl = new MilvusCtrl();

  // 并行执行多个查询的 BM25 检索
  const recallResults = await Promise.all(
    queries.map(async (query) => {
      return await milvusCtrl.fullTextSearch({
        teamId,
        datasetIds,
        query,
        limit,
        forbidCollectionIdList,
        filterCollectionIdList
      });
    })
  );

  const vectorIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.id)).flat())
  );
  const collectionIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
  );

  const [dataMap, collectionMaps] = await Promise.all([
    MongoDatasetData.find({ 'indexes.dataId': { $in: vectorIds } }, datasetDataSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => {
          item.indexes?.forEach((idx: any) => {
            if (idx.dataId) map.set(String(idx.dataId), item);
          });
        });
        return map;
      }),
    MongoDatasetCollection.find(
      { _id: { $in: collectionIds.map((id) => new Types.ObjectId(id)) }, deleteTime: null },
      datasetCollectionSelectField,
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      })
  ]);

  const results = recallResults.map((queryResults) => {
    return queryResults
      .map((item, index) => {
        const collection = collectionMaps.get(String(item.collectionId));
        if (!collection) {
          console.log('Collection is not found', item);
          return null;
        }

        const data = dataMap.get(String(item.id));
        if (!data) {
          console.log('Data is not found', item);
          return null;
        }

        const synonymMappings = extractChunkSynonyms(data, String(item.id));

        return {
          id: String(data._id),
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          updateTime: data.updateTime,
          ...formatDatasetDataValue({
            q: data.q,
            a: data.a,
            imageId: data.imageId,
            imageDescMap: data.imageDescMap
          }),
          chunkIndex: data.chunkIndex,
          metadata: data.metadata,
          ...getCollectionSourceData(collection),
          score: [{ type: SearchScoreTypeEnum.fullText, value: item.score || 0, index }],
          synonymMappings: synonymMappings.length > 0 ? synonymMappings : undefined
        } as SearchDataResponseItemType;
      })
      .filter((item): item is SearchDataResponseItemType => item !== null)
      .map((item, index) => ({
        ...item,
        score: item.score.map((s) => ({ ...s, index }))
      }));
  });

  return { results };
}

/**
 * MongoDB 全文检索（多查询，返回 2D per-query 结果）
 * 支持 customWords（知识库同义词词表）
 */
export async function fullTextRecallFromMongo(options: {
  teamId: string;
  datasetIds: string[];
  queries: string[];
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
  customWords?: string[];
}): Promise<{ results: SearchDataResponseItemType[][] }> {
  const {
    teamId,
    datasetIds,
    queries,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList,
    customWords = []
  } = options;

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  const recallResults = await Promise.all(
    queries.map(async (query) => {
      const jiebaSplitResult = await jiebaSplitWithCustomDict({ text: query, customWords });
      return (await MongoDatasetDataText.aggregate(
        [
          {
            $match: {
              teamId: new Types.ObjectId(teamId),
              $text: { $search: jiebaSplitResult },
              datasetId: { $in: datasetIds.map((id) => new Types.ObjectId(id)) },
              ...(filterCollectionIdList
                ? {
                    collectionId: {
                      $in: filterCollectionIdList
                        .filter((id) => !forbidCollectionIdList.includes(id))
                        .map((id) => new Types.ObjectId(id))
                    }
                  }
                : forbidCollectionIdList?.length
                  ? {
                      collectionId: {
                        $nin: forbidCollectionIdList.map((id) => new Types.ObjectId(id))
                      }
                    }
                  : {})
            }
          },
          { $sort: { score: { $meta: 'textScore' } } },
          { $limit: limit },
          { $project: { _id: 1, collectionId: 1, dataId: 1, score: { $meta: 'textScore' } } }
        ],
        { ...readFromSecondary }
      )) as (DatasetDataTextSchemaType & { score: number })[];
    })
  );

  const dataIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.dataId)).flat())
  );
  const collectionIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
  );

  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find({ _id: { $in: dataIds } }, datasetDataSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      }),
    MongoDatasetCollection.find({ _id: { $in: collectionIds }, deleteTime: null }, datasetCollectionSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      })
  ]);

  const results = recallResults.map((queryResults) => {
    return queryResults
      .map((item, index) => {
        const collection = collectionMaps.get(String(item.collectionId));
        if (!collection) {
          console.log('Collection is not found', item);
          return null;
        }
        const data = dataMaps.get(String(item.dataId));
        if (!data) {
          console.log('Data is not found', item);
          return null;
        }

        return {
          id: String(data._id),
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          updateTime: data.updateTime,
          ...formatDatasetDataValue({
            q: data.q,
            a: data.a,
            imageId: data.imageId,
            imageDescMap: data.imageDescMap
          }),
          chunkIndex: data.chunkIndex,
          metadata: data.metadata,
          ...getCollectionSourceData(collection),
          score: [{ type: SearchScoreTypeEnum.fullText, value: item.score || 0, index }]
        } as SearchDataResponseItemType;
      })
      .filter((item): item is SearchDataResponseItemType => item !== null)
      .map((item, index) => ({
        ...item,
        score: item.score.map((s) => ({ ...s, index }))
      }));
  });

  return { results };
}

/**
 * 全文检索（多查询版）
 * 自动路由：Milvus 2.6+ BM25 或 MongoDB 全文检索
 * 返回 2D per-query 结果，供 controller 做第一层 RRF
 */
export async function fullTextRecallPerQuery(
  options: RecallOptions & { customWords?: string[] }
): Promise<{ results: SearchDataResponseItemType[][] }> {
  const {
    teamId,
    datasetIds,
    queries,
    limit,
    forbidCollectionIdList = [],
    filterCollectionIdList,
    customWords = []
  } = options;

  if (limit === 0) {
    return { results: [] };
  }

  // 决策：使用 Milvus BM25 还是 MongoDB？
  const useMilvusFullText = (() => {
    if (!MILVUS_ADDRESS) return false;
    if (PG_ADDRESS || OCEANBASE_ADDRESS) return false;
    if (!milvusVersionManager.supportsFullText()) return false;
    if (process.env.MILVUS_FULL_TEXT_ENABLED === 'false') return false;
    return true;
  })();

  if (useMilvusFullText) {
    return fullTextRecallFromMilvus({
      teamId,
      datasetIds,
      queries,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    });
  }

  return fullTextRecallFromMongo({
    teamId,
    datasetIds,
    queries,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList,
    customWords
  });
}

/* ==================== Milvus 混合检索 ==================== */

/**
 * Milvus 混合检索（向量 + BM25，内部做融合）
 * 返回 2D per-query 结果，供 controller 做第一层 RRF
 */
export async function milvusHybridRecall(options: {
  teamId: string;
  datasetIds: string[];
  queries: string[];
  modelId: string;
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
}): Promise<{ results: SearchDataResponseItemType[][]; tokens: number }> {
  const {
    teamId,
    datasetIds,
    queries,
    modelId,
    limit,
    forbidCollectionIdList,
    filterCollectionIdList
  } = options;

  const datasetDataSelectField =
    '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes metadata';
  const datasetCollectionSelectField =
    '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

  const vectorModel = getEmbeddingModelById(modelId);
  const { vectors, tokens } = await getVectorsByText({
    model: vectorModel,
    input: queries,
    type: 'query'
  });

  const milvusCtrl = new MilvusCtrl();
  const recallResults = await Promise.all(
    vectors.map(async (vector, index) => {
      return await milvusCtrl.hybridSearch({
        teamId,
        datasetIds,
        vector,
        query: queries[index],
        limit,
        forbidCollectionIdList,
        filterCollectionIdList
      });
    })
  );

  const vectorIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.id)).flat())
  );
  const collectionIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
  );

  const [dataMap, collectionMaps] = await Promise.all([
    MongoDatasetData.find({ 'indexes.dataId': { $in: vectorIds } }, datasetDataSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => {
          item.indexes?.forEach((idx: any) => {
            if (idx.dataId) map.set(String(idx.dataId), item);
          });
        });
        return map;
      }),
    MongoDatasetCollection.find(
      { _id: { $in: collectionIds.map((id) => new Types.ObjectId(id)) }, deleteTime: null },
      datasetCollectionSelectField,
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      })
  ]);

  const results = recallResults.map((queryResults) => {
    return queryResults
      .map((item, index) => {
        const collection = collectionMaps.get(String(item.collectionId));
        const data = dataMap.get(String(item.id));
        if (!collection || !data) return null;

        return {
          id: String(data._id),
          datasetId: String(data.datasetId),
          collectionId: String(data.collectionId),
          updateTime: data.updateTime,
          ...formatDatasetDataValue({
            q: data.q,
            a: data.a,
            imageId: data.imageId,
            imageDescMap: data.imageDescMap
          }),
          chunkIndex: data.chunkIndex,
          metadata: data.metadata,
          ...getCollectionSourceData(collection),
          score: [{ type: SearchScoreTypeEnum.rrf, value: item.score || 0, index }]
        } as SearchDataResponseItemType;
      })
      .filter((item): item is SearchDataResponseItemType => item !== null);
  });

  return { results, tokens };
}

/* ==================== RRF 融合 ==================== */

/**
 * RRF (Reciprocal Rank Fusion) 融合
 * 将多路检索结果按排名融合
 */
export function rrfFusion(
  embeddingResults: SearchDataResponseItemType[],
  fullTextResults: SearchDataResponseItemType[],
  embeddingWeight: number = 0.5
): SearchDataResponseItemType[] {
  if (embeddingResults.length === 0 && fullTextResults.length === 0) {
    return [];
  }

  const embWeight = embeddingWeight;
  const ftWeight = 1 - embeddingWeight;

  const rrfResults = datasetSearchResultConcat([
    { weight: embWeight, list: embeddingResults },
    { weight: ftWeight, list: fullTextResults }
  ]);

  return rrfResults;
}

/* ==================== 重排 ==================== */

/**
 * 文档重排
 * 使用 Rerank 模型对检索结果进行重排
 */
export async function rerank(
  query: string,
  results: SearchDataResponseItemType[],
  rerankModel: RerankModelItemType
): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
  rerankTime?: number;
}> {
  if (results.length === 0) {
    return { results: [], inputTokens: 0 };
  }

  const startTime = Date.now();

  const documents = results.map((r) => ({
    id: r.id,
    text: r.q && r.a ? `${r.q}\n${r.a}` : r.q || r.a || ''
  }));

  try {
    const result = await reRankRecall({
      query,
      documents,
      model: rerankModel
    });

    const rerankScoreMap = new Map(result.results.map((r: any) => [r.id, r.score]));

    const rerankedResults = results.map((r) => {
      const rerankScore = rerankScoreMap.get(r.id);
      if (rerankScore !== undefined) {
        return {
          ...r,
          score: [
            ...r.score.filter((s) => s.type !== SearchScoreTypeEnum.reRank),
            { type: SearchScoreTypeEnum.reRank as const, value: rerankScore, index: 0 }
          ]
        };
      }
      return r;
    });

    // 按 rerank score 排序
    rerankedResults.sort((a, b) => {
      const aScore = a.score.find((s) => s.type === SearchScoreTypeEnum.reRank)?.value || 0;
      const bScore = b.score.find((s) => s.type === SearchScoreTypeEnum.reRank)?.value || 0;
      return bScore - aScore;
    });

    const rerankTime = +((Date.now() - startTime) / 1000).toFixed(2);

    return {
      results: rerankedResults,
      inputTokens: result.inputTokens || 0,
      rerankTime
    };
  } catch (error) {
    addLog.error('[rerank] Rerank failed', { error });
    return {
      results,
      inputTokens: 0,
      rerankTime: undefined
    };
  }
}

/* ==================== 相似度过滤 ==================== */

/**
 * 按相似度阈值过滤结果
 */
export function filterBySimilarity(
  results: SearchDataResponseItemType[],
  threshold: number,
  usingReRank: boolean = false
): {
  filtered: SearchDataResponseItemType[];
  discarded: SearchDataResponseItemType[];
} {
  const filtered: SearchDataResponseItemType[] = [];
  const discarded: SearchDataResponseItemType[] = [];

  results.forEach((item) => {
    const scoreType = usingReRank ? SearchScoreTypeEnum.reRank : SearchScoreTypeEnum.embedding;
    const score = item.score.find((s) => s.type === scoreType)?.value || 0;

    if (score >= threshold) {
      filtered.push(item);
    } else {
      discarded.push(item);
    }
  });

  return { filtered, discarded };
}

/* ==================== Token 限制 ==================== */

/**
 * 按 token 数量限制结果
 */
export async function filterByTokens(
  results: SearchDataResponseItemType[],
  maxTokens: number
): Promise<SearchDataResponseItemType[]> {
  let currentTokens = 0;
  const filtered: SearchDataResponseItemType[] = [];

  for (const item of results) {
    const qLength = item.q?.length || 0;
    const aLength = item.a?.length || 0;
    // 简单估算：中文约 1 token/字符，英文约 1.3 token/字符
    const estimatedTokens = Math.ceil((qLength + aLength) / 2);

    if (currentTokens + estimatedTokens <= maxTokens) {
      filtered.push(item);
      currentTokens += estimatedTokens;
    } else {
      break;
    }
  }

  return filtered;
}

/* ==================== 去重 ==================== */

/**
 * 基于内容 hash 去重
 */
export function dedupeByContent(
  results: SearchDataResponseItemType[]
): SearchDataResponseItemType[] {
  const set = new Set<string>();
  const deduped: SearchDataResponseItemType[] = [];

  results.forEach((item) => {
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return;
    set.add(str);
    deduped.push(item);
  });

  return deduped;
}

/* ==================== 混合检索 ==================== */

/**
 * 混合检索
 * 向量检索 + 全文检索 + RRF 融合 + 重排（可选）
 */
export async function mixedRecall(options: MixedRecallOptions): Promise<MixedRecallResult> {
  const {
    teamId,
    datasetIds,
    queries,
    modelId,
    limit,
    embeddingWeight = 0.5,
    usingReRank = false,
    rerankModel,
    similarity = 0,
    rerankMethod,
    rerankWeight = 0.5,
    forbidCollectionIdList = [],
    filterCollectionIdList
  } = options;

  const startTime = Date.now();

  // 并行执行向量检索和全文检索
  const [{ results: embResults, tokens: embTokens }, ftResult] = await Promise.all([
    embeddingRecall({
      teamId,
      datasetIds,
      queries,
      modelId,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    }),
    fullTextRecall({
      teamId,
      datasetIds,
      queries,
      modelId,
      limit,
      forbidCollectionIdList,
      filterCollectionIdList
    })
  ]);

  // RRF 融合
  let fusedResults = rrfFusion(embResults, ftResult.results, embeddingWeight);

  // 去重
  fusedResults = dedupeByContent(fusedResults);

  // 重排（可选）
  let usingReRankResult = false;
  let rerankTime: number | undefined;

  if (usingReRank && rerankModel && fusedResults.length > 0) {
    const rerankResult = await rerank(queries[0] || '', fusedResults, rerankModel);
    fusedResults = rerankResult.results;
    usingReRankResult = true;
    rerankTime = rerankResult.rerankTime;
  }

  // 相似度过滤
  if (similarity > 0) {
    const { filtered } = filterBySimilarity(fusedResults, similarity, usingReRankResult);
    fusedResults = filtered;
  }

  const retrievalTime = +((Date.now() - startTime) / 1000).toFixed(2);

  return {
    results: fusedResults,
    tokens: embTokens,
    usingReRank: usingReRankResult,
    rerankTime,
    retrievalTime
  };
}
