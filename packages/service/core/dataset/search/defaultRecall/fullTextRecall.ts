import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { Types } from '../../../../common/mongo';
import { getLogger, LogCategories } from '../../../../common/logger';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetData } from '../../data/schema';
import { getFullTextStore } from '../../data/textStore';
import type { FullTextSearchItem } from '../../../../common/vectorDB/type';
import { datasetCollectionSelectField, datasetDataSelectField } from './constant';
import { buildSearchResultItem, concatRecallLists } from './result';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type FullTextRecallSource = 'text' | 'imageCaption';

type FullTextTaskItems = { source: FullTextRecallSource; items: FullTextSearchItem[] }[];

type FullTextRecallScope = {
  teamId: string;
  datasetIds: string[];
  filterCollectionIdList?: string[];
  forbidCollectionIdList: string[];
};

/** data/collection 反查结果的查找 map(供 buildItemFromFullTextSearch 消费)。 */
type DataCollectionMaps = {
  dataMaps: Map<string, DatasetDataSchemaType>;
  collectionMaps: Map<string, DatasetCollectionSchemaType>;
};

/**
 * 在请求范围内反查主数据和集合；全文索引不是权限或来源归属的权威数据。
 * collectionIds 已排除不可读和禁用集合，当前 forbid 状态仍需在 Mongo 中复核。
 */
const buildDataCollectionMaps = async ({
  dataIds,
  collectionIds,
  scope
}: {
  dataIds: string[];
  collectionIds: string[];
  scope: FullTextRecallScope;
}): Promise<DataCollectionMaps> => {
  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find(
      {
        teamId: scope.teamId,
        datasetId: { $in: scope.datasetIds },
        collectionId: { $in: collectionIds },
        _id: { $in: dataIds }
      },
      datasetDataSelectField,
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetDataSchemaType>();

        res.forEach((item) => {
          map.set(String(item._id), item);
        });

        return map;
      }),
    MongoDatasetCollection.find(
      {
        teamId: scope.teamId,
        datasetId: { $in: scope.datasetIds },
        _id: { $in: collectionIds },
        forbid: { $ne: true }
      },
      { ...datasetCollectionSelectField, datasetId: 1 },
      { ...readFromSecondary }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, DatasetCollectionSchemaType>();

        res.forEach((item) => {
          map.set(String(item._id), item);
        });

        return map;
      })
  ]);

  return { dataMaps, collectionMaps };
};

/**
 * 单个 FullTextSearchItem 组装为搜索结果(ISSUE-011 局部函数)。
 * data/collection 缺失或归属不一致时跳过，避免旧索引把内容归到错误来源。
 */
const buildItemFromFullTextSearch = ({
  item,
  index,
  maps: { dataMaps, collectionMaps }
}: {
  item: FullTextSearchItem;
  index: number;
  maps: DataCollectionMaps;
}): SearchDataResponseItemType | undefined => {
  const collection = collectionMaps.get(String(item.collectionId));
  if (!collection) {
    logger.warn('Dataset collection not found during full-text recall', {
      collectionId: item.collectionId,
      dataId: item.dataId
    });
    return;
  }

  const data = dataMaps.get(String(item.dataId));
  if (!data) {
    logger.warn('Dataset data not found during full-text recall', {
      dataId: item.dataId,
      collectionId: item.collectionId
    });
    return;
  }

  if (
    String(data.collectionId) !== String(collection._id) ||
    String(data.datasetId) !== String(collection.datasetId)
  ) {
    logger.warn('Dataset data and collection mismatch during full-text recall', {
      dataId: item.dataId,
      collectionId: item.collectionId
    });
    return;
  }

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
};

/**
 * 丢弃范围外或无效的索引命中，再回查主数据、按 source 分组和融合。
 * 过滤后重新编号，保留合法结果原有的相对顺序、分数和结果上限。
 */
const buildResultsFromRecallItems = async ({
  taskItems,
  limit,
  scope
}: {
  taskItems: FullTextTaskItems;
  limit: number;
  scope: FullTextRecallScope;
}): Promise<{
  textFullTextRecallResults: SearchDataResponseItemType[];
  imageCaptionFullTextRecallResults: SearchDataResponseItemType[];
}> => {
  const readableIds = scope.filterCollectionIdList
    ? new Set(scope.filterCollectionIdList.map((id) => id.toLowerCase()))
    : undefined;
  const forbiddenIds = new Set(scope.forbidCollectionIdList.map((id) => id.toLowerCase()));
  const scopedTasks = taskItems.map((task) => ({
    source: task.source,
    items: task.items
      .filter(
        (item) =>
          typeof item.dataId === 'string' &&
          typeof item.collectionId === 'string' &&
          Types.ObjectId.isValid(item.dataId) &&
          Types.ObjectId.isValid(item.collectionId)
      )
      .map((item) => ({
        ...item,
        dataId: item.dataId.toLowerCase(),
        collectionId: item.collectionId.toLowerCase()
      }))
      .filter(
        (item) =>
          (!readableIds || readableIds.has(item.collectionId)) &&
          !forbiddenIds.has(item.collectionId)
      )
  }));
  const dataIds = Array.from(
    new Set(scopedTasks.flatMap((task) => task.items.map((item) => item.dataId)))
  );
  const collectionIds = Array.from(
    new Set(scopedTasks.flatMap((task) => task.items.map((item) => item.collectionId)))
  );

  if (dataIds.length === 0) {
    return { textFullTextRecallResults: [], imageCaptionFullTextRecallResults: [] };
  }

  const maps = await buildDataCollectionMaps({ dataIds, collectionIds, scope });

  const groupedRecallLists: Record<FullTextRecallSource, SearchDataResponseItemType[][]> = {
    text: [],
    imageCaption: []
  };

  for (const task of scopedTasks) {
    const list = (
      await Promise.all(
        task.items.map((item, index) => buildItemFromFullTextSearch({ item, index, maps }))
      )
    )
      .filter((item): item is SearchDataResponseItemType => Boolean(item))
      .map((item, index) => {
        return {
          ...item,
          score: item.score.map((score) => ({ ...score, index }))
        };
      });

    groupedRecallLists[task.source].push(list);
  }

  return {
    textFullTextRecallResults: concatRecallLists(groupedRecallLists.text, limit),
    imageCaptionFullTextRecallResults: concatRecallLists(groupedRecallLists.imageCaption, limit)
  };
};

/**
 * 执行 full-text 召回并按 query 来源分组返回。
 * 底层引擎跟随实际向量库 provider(milvus -> BM25;其他向量库 -> Mongo $text),
 * 统一走 getFullTextStore().search,结果归一化为 { dataId, collectionId, score }。
 */
export const fullTextRecall = async ({
  teamId,
  datasetIds,
  queryGroups,
  limit,
  filterCollectionIdList,
  forbidCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  queryGroups: {
    source: FullTextRecallSource;
    queries: string[];
  }[];
  limit: number;
  filterCollectionIdList?: string[];
  forbidCollectionIdList: string[];
}): Promise<{
  textFullTextRecallResults: SearchDataResponseItemType[];
  imageCaptionFullTextRecallResults: SearchDataResponseItemType[];
}> => {
  const queryTasks = queryGroups.flatMap((group) =>
    group.queries
      .map((query) => query.trim())
      .filter(Boolean)
      .map((query) => ({ source: group.source, query }))
  );

  if (
    limit === 0 ||
    queryTasks.length === 0 ||
    datasetIds.length === 0 ||
    filterCollectionIdList?.length === 0
  ) {
    return {
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    };
  }

  const store = getFullTextStore();
  const taskItems = await Promise.all(
    queryTasks.map(async ({ source, query }) => {
      const items = await store.search({
        teamId,
        datasetIds,
        query,
        limit,
        forbidCollectionIdList,
        filterCollectionIdList
      });
      return { source, items };
    })
  );

  return buildResultsFromRecallItems({
    taskItems,
    limit,
    scope: { teamId, datasetIds, filterCollectionIdList, forbidCollectionIdList }
  });
};
