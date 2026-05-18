import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  DatasetDataTextSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { jiebaSplit } from '../../../../common/string/jieba/index';
import { Types } from '../../../../common/mongo';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { getLogger, LogCategories } from '../../../../common/logger';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetDataText } from '../../data/dataTextSchema';
import { MongoDatasetData } from '../../data/schema';
import { datasetCollectionSelectField, datasetDataSelectField } from './constant';
import { buildSearchResultItem, concatRecallLists } from './result';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type FullTextRecallSource = 'text' | 'imageCaption';

/**
 * 执行 Mongo full-text 召回并按 query 来源分组返回。
 * 目前 full-text 只处理文本类 query：用户文本和图片 caption。原始图片不会进入这里，
 * 因为 Mongo 文本索引无法直接消费图片向量或图片 URL。
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

  if (limit === 0 || queryTasks.length === 0) {
    return {
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    };
  }

  const recallResults = await Promise.all(
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

  const dataIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.dataId)).flat())
  );
  const collectionIds = Array.from(
    new Set(recallResults.map((item) => item.map((item) => item.collectionId)).flat())
  );

  // full-text 表只保存 dataId/collectionId/score，展示字段仍回查主 data 与 collection。
  const [dataMaps, collectionMaps] = await Promise.all([
    MongoDatasetData.find(
      {
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
        _id: { $in: collectionIds }
      },
      datasetCollectionSelectField,
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

  const groupedRecallLists: Record<FullTextRecallSource, SearchDataResponseItemType[][]> = {
    text: [],
    imageCaption: []
  };

  recallResults.forEach((recallResult, taskIndex) => {
    const task = queryTasks[taskIndex];
    const list = recallResult
      .map((item, index) => {
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
      .filter((item) => {
        if (!item) return false;
        return true;
      })
      .map((item, index) => {
        return {
          ...item,
          score: item!.score.map((item) => ({ ...item, index }))
        };
      }) as SearchDataResponseItemType[];

    groupedRecallLists[task.source].push(list);
  });

  return {
    textFullTextRecallResults: concatRecallLists(groupedRecallLists.text, limit),
    imageCaptionFullTextRecallResults: concatRecallLists(groupedRecallLists.imageCaption, limit)
  };
};
