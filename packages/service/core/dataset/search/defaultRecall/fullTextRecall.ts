import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  DatasetDataTextSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import type { EmbeddingRecallItemType } from '../../../../common/vectorDB/type';
import { jiebaSplit } from '../../../../common/string/jieba/index';
import { Types } from '../../../../common/mongo';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { serviceEnv } from '../../../../env';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetDataText } from '../../data/dataTextSchema';
import { MongoDatasetData } from '../../data/schema';
import { MILVUS_ADDRESS } from '../../../../common/vectorDB/constants';
import { datasetCollectionSelectField, datasetDataSelectField } from './constant';
import { buildSearchResultItem, concatRecallLists } from './result';
import { MilvusCtrl } from '../../../../common/vectorDB/milvus';
import { milvusVersionManager } from '../../../../common/vectorDB/milvus/version';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type FullTextRecallSource = 'text' | 'imageCaption';

/** 统一的召回结果格式，屏蔽 Milvus / Mongo 的字段差异 */
type RecallItem = {
  source: FullTextRecallSource;
  dataId: string;
  collectionId: string;
  score: number;
};

interface FullTextRecallProps {
  teamId: string;
  datasetIds: string[];
  queryGroups: {
    source: FullTextRecallSource;
    queries: string[];
  }[];
  limit: number;
  filterCollectionIdList?: string[];
  forbidCollectionIdList: string[];
}

export const getFullTextEngine = (): 'mongo' | 'milvus' => {
  const value = serviceEnv.FULL_TEXT_ENGINE;
  if (!value) return 'mongo';

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'milvus') return 'milvus';
  if (normalized === 'mongo') return 'mongo';

  logger.warn('Unknown FULL_TEXT_ENGINE value, defaulting to mongo', {
    fullTextEngine: value
  });
  return 'mongo';
};

const computeUseMilvusFullText = (): boolean => {
  const fullTextEngine = getFullTextEngine();

  if (fullTextEngine !== 'milvus') {
    return false;
  }

  if (!MILVUS_ADDRESS || !milvusVersionManager.supportsFullText()) {
    return false;
  }

  return true;
};

const fullTextRecallFromMilvus = async ({
  teamId,
  datasetIds,
  queryTasks,
  limit,
  filterCollectionIdList,
  forbidCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  queryTasks: { source: FullTextRecallSource; query: string }[];
  limit: number;
  filterCollectionIdList?: string[];
  forbidCollectionIdList: string[];
}): Promise<{
  recallResults: { source: FullTextRecallSource; results: EmbeddingRecallItemType[] }[];
  error?: string;
}> => {
  const milvusCtrl = new MilvusCtrl();

  try {
    const results = await Promise.all(
      queryTasks.map(async ({ query }) => {
        return await milvusCtrl.fullTextSearch!({
          teamId,
          datasetIds,
          query,
          limit,
          forbidCollectionIdList,
          filterCollectionIdList
        });
      })
    );

    return {
      recallResults: results.map((result, index) => ({
        source: queryTasks[index].source,
        results: result.results
      }))
    };
  } catch (err) {
    return {
      recallResults: [],
      error: err instanceof Error ? err.message : String(err)
    };
  }
};

const mongoFullTextRecall = async ({
  teamId,
  datasetIds,
  queryTasks,
  limit,
  filterCollectionIdList,
  forbidCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  queryTasks: { source: FullTextRecallSource; query: string }[];
  limit: number;
  filterCollectionIdList?: string[];
  forbidCollectionIdList: string[];
}) => {
  return await Promise.all(
    queryTasks.map(async ({ query }) => {
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
};

/**
 * 统一的搜索结果组装：根据归一化的 RecallItem 列表，查 data/collection、去重、建 item、按 source 分组拼接。
 */
const buildResultsFromRecallItems = async ({
  taskItems,
  limit
}: {
  taskItems: { source: FullTextRecallSource; items: Omit<RecallItem, 'source'>[] }[];
  limit: number;
}): Promise<{
  textFullTextRecallResults: SearchDataResponseItemType[];
  imageCaptionFullTextRecallResults: SearchDataResponseItemType[];
}> => {
  const dataIds = Array.from(
    new Set(taskItems.flatMap((t) => t.items.map((r) => r.dataId)).filter(Boolean))
  );
  const collectionIds = Array.from(
    new Set(taskItems.flatMap((t) => t.items.map((r) => r.collectionId)).filter(Boolean))
  );

  const [dataMap, collectionMap] = await Promise.all([
    MongoDatasetData.find({ _id: { $in: dataIds } }, datasetDataSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      }),
    MongoDatasetCollection.find({ _id: { $in: collectionIds } }, datasetCollectionSelectField, {
      ...readFromSecondary
    })
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();
        res.forEach((item) => map.set(String(item._id), item));
        return map;
      })
  ]);

  const grouped: Record<FullTextRecallSource, SearchDataResponseItemType[][]> = {
    text: [],
    imageCaption: []
  };
  const seen = new Set<string>();

  for (const task of taskItems) {
    const list = (
      await Promise.all(
        task.items.map((item, index) => {
          const collection = collectionMap.get(String(item.collectionId));
          if (!collection) {
            logger.warn('Collection not found during full-text recall', {
              collectionId: item.collectionId,
              dataId: item.dataId
            });
            return;
          }

          const data = dataMap.get(String(item.dataId));
          if (!data) {
            logger.warn('Data not found during full-text recall', {
              dataId: item.dataId,
              collectionId: item.collectionId
            });
            return;
          }

          if (seen.has(String(data._id))) return;
          seen.add(String(data._id));

          return buildSearchResultItem({
            data,
            collection,
            includeIndexes: true,
            score: [
              {
                type: SearchScoreTypeEnum.fullText,
                value: item.score || 0,
                index
              }
            ]
          });
        })
      )
    )
      .filter((item): item is SearchDataResponseItemType => !!item)
      .map((item, i) => ({
        ...item,
        score: item.score.map((si) => ({ ...si, index: i }))
      }));

    grouped[task.source].push(list);
  }

  return {
    textFullTextRecallResults: concatRecallLists(grouped.text, limit),
    imageCaptionFullTextRecallResults: concatRecallLists(grouped.imageCaption, limit)
  };
};

/**
 * 执行全文召回并按 query 来源分组返回。
 * 当 FULL_TEXT_ENGINE='milvus'、当前向量库为 Milvus、版本 >= 2.6 时，
 * 使用 Milvus BM25 全文检索；否则降级到 MongoDB $text 检索。
 */
export const fullTextRecall = async ({
  teamId,
  datasetIds,
  queryGroups,
  limit,
  filterCollectionIdList,
  forbidCollectionIdList
}: FullTextRecallProps): Promise<{
  textFullTextRecallResults: SearchDataResponseItemType[];
  imageCaptionFullTextRecallResults: SearchDataResponseItemType[];
}> => {
  const queryTasks = queryGroups.flatMap((group) =>
    group.queries
      .map((query) => query.trim())
      .filter(Boolean)
      .map((query) => ({ source: group.source, query }))
  );

  if (limit === 0 || queryTasks.length === 0) {
    return {
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    };
  }

  const useMilvusFullText = computeUseMilvusFullText();

  if (useMilvusFullText) {
    const startTime = Date.now();
    const { recallResults, error } = await fullTextRecallFromMilvus({
      teamId,
      datasetIds,
      queryTasks,
      limit,
      filterCollectionIdList,
      forbidCollectionIdList
    });
    const costMs = Date.now() - startTime;

    if (!error) {
      logger.info('Milvus full-text recall succeeded', {
        teamId,
        datasetIds,
        costMs,
        isFallback: false,
        fullTextEngine: 'milvus'
      });

      // 归一化：vectorId → dataId（通过 indexes.dataId 反查）
      const vectorIds = Array.from(
        new Set(recallResults.flatMap((g) => g.results.map((r) => r.id?.trim())).filter(Boolean))
      );
      const vectorToDataId = new Map<string, string>();
      if (vectorIds.length > 0) {
        const docs = await MongoDatasetData.find(
          { 'indexes.dataId': { $in: vectorIds } },
          { _id: 1, indexes: 1 },
          { ...readFromSecondary }
        ).lean();
        for (const doc of docs) {
          for (const idx of doc.indexes) {
            if (idx.dataId && vectorIds.includes(String(idx.dataId))) {
              vectorToDataId.set(String(idx.dataId), String(doc._id));
            }
          }
        }
      }

      const taskItems = recallResults.map((group) => ({
        source: group.source,
        items: group.results.map((r) => ({
          dataId: vectorToDataId.get(r.id?.trim() ?? '') ?? '',
          collectionId: r.collectionId,
          score: r.score
        }))
      }));

      return buildResultsFromRecallItems({ taskItems, limit });
    }

    logger.warn('Milvus full-text recall failed, falling back to MongoDB', {
      teamId,
      datasetIds,
      costMs,
      isFallback: true,
      fullTextEngine: 'milvus',
      errorType: 'milvus_fulltext_search_failed',
      error
    });
  } else {
    logger.info('Using MongoDB full-text recall', {
      teamId,
      datasetIds,
      isFallback: !useMilvusFullText,
      fullTextEngine: getFullTextEngine()
    });
  }

  const mongoResults = await mongoFullTextRecall({
    teamId,
    datasetIds,
    queryTasks,
    limit,
    filterCollectionIdList,
    forbidCollectionIdList
  });

  // 归一化：Mongo 结果中 dataId 即为文档 _id
  const taskItems = mongoResults.map((group, i) => ({
    source: queryTasks[i].source,
    items: group.map((r) => ({
      dataId: r.dataId,
      collectionId: r.collectionId,
      score: r.score
    }))
  }));

  return buildResultsFromRecallItems({ taskItems, limit });
};
