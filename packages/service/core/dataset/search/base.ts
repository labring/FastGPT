import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { recallFromVectorStore } from '../../../common/vectorDB/controller';
import { getVectorsByText } from '../../ai/embedding';
import { getEmbeddingModel } from '../../ai/model';
import { MongoDatasetData } from '../data/schema';
import { MongoDatasetCollection } from '../collection/schema';
import { readFromSecondary } from '../../../common/mongo/utils';
import { formatDatasetDataValue } from '../data/controller';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType
} from '@fastgpt/global/core/dataset/type';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';

// 数据库查询字段定义
export const datasetDataSelectField =
  '_id datasetId collectionId updateTime q a imageId imageDescMap chunkIndex indexes';
export const datasetCollectionSelectField =
  '_id name fileId rawLink apiFileId externalFileId externalFileUrl';

export const embeddingRecall = async ({
  teamId,
  datasetIds,
  queries,
  model,
  limit,
  forbidCollectionIdList = [],
  filterCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  queries: string[];
  model: string;
  limit: number;
  forbidCollectionIdList?: string[];
  filterCollectionIdList?: string[];
}): Promise<{
  embeddingRecallResults: SearchDataResponseItemType[][];
  tokens: number;
}> => {
  if (limit === 0) {
    return {
      embeddingRecallResults: [],
      tokens: 0
    };
  }

  const { vectors, tokens } = await getVectorsByText({
    model: getEmbeddingModel(model),
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

  // Get data and collections
  const collectionIdList = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.collectionId)).flat())
  );
  const indexDataIds = Array.from(
    new Set(recallResults.map((item) => item.results.map((item) => item.id?.trim())).flat())
  );

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
            map.set(String(index.dataId), item);
          });
        });

        return map;
      }),
    MongoDatasetCollection.find(
      {
        _id: { $in: collectionIdList }
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

  const embeddingRecallResults = recallResults.map((item) => {
    const set = new Set<string>();
    return (
      item.results
        .map((item, index) => {
          const collection = collectionMaps.get(String(item.collectionId));
          if (!collection) {
            console.log('Collection is not found', item);
            return;
          }

          const data = dataMaps.get(String(item.id));
          if (!data) {
            console.log('Data is not found', item);
            return;
          }

          const result: SearchDataResponseItemType = {
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
            score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }]
          };

          return result;
        })
        // 多个向量对应一个数据，每一路召回，保障数据只有一份，并且取最高排名
        .filter((item) => {
          if (!item) return false;
          if (set.has(item.id)) return false;
          set.add(item.id);
          return true;
        })
        .map((item, index) => {
          return {
            ...item!,
            score: item!.score.map((item) => ({ ...item, index }))
          };
        }) as SearchDataResponseItemType[]
    );
  });

  return {
    embeddingRecallResults,
    tokens
  };
};
