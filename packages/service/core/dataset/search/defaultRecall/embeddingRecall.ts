import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { recallFromVectorStore } from '../../../../common/vectorDB/controller';
import { getVectors } from '../../../ai/embedding';
import { getEmbeddingModel, isImageEmbeddingModel } from '../../../ai/model';
import { MongoDatasetCollection } from '../../collection/schema';
import { MongoDatasetData } from '../../data/schema';
import { getLogger, LogCategories } from '../../../../common/logger';
import { readFromSecondary } from '../../../../common/mongo/utils';
import { normalizeImageToBase64 } from '../utils';
import { datasetCollectionSelectField, datasetDataSelectField } from './constant';
import { buildSearchResultItem, concatRecallLists } from './result';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type EmbeddingRecallSource = 'text' | 'imageCaption' | 'image';

type VectorRecallTask = {
  source: EmbeddingRecallSource;
  vector: number[];
};

const emptyEmbeddingRecallResult = () => ({
  textEmbeddingRecallResults: [] as SearchDataResponseItemType[],
  imageCaptionEmbeddingRecallResults: [] as SearchDataResponseItemType[],
  imageVectorRecallResults: [] as SearchDataResponseItemType[]
});

/**
 * 构造向量召回任务。
 * 文本 query 和图片描述 query 都按 text embedding 处理；原始图片 query 只有在当前
 * embedding 模型支持图片时才会转 base64 并参与 image embedding。单张图片解析失败
 * 会被跳过，避免影响其他文本或图片任务。
 */
const buildVectorRecallTasks = async ({
  model,
  textQueries,
  imageCaptionQueries,
  imageQueries
}: {
  model: string;
  textQueries: string[];
  imageCaptionQueries: string[];
  imageQueries: string[];
}): Promise<{
  tasks: VectorRecallTask[];
  tokens: number;
}> => {
  const embeddingModel = getEmbeddingModel(model);
  const textTasks = [
    ...textQueries.map((query) => ({ source: 'text' as const, query })),
    ...imageCaptionQueries.map((query) => ({ source: 'imageCaption' as const, query }))
  ]
    .map((item) => ({
      ...item,
      query: item.query.trim()
    }))
    .filter((item) => item.query);

  const vectorInputs: {
    source: EmbeddingRecallSource;
    input: Parameters<typeof getVectors>[0]['inputs'][number];
  }[] = textTasks.map((item) => ({
    source: item.source,
    input: {
      type: 'text',
      input: item.query
    }
  }));

  const validImageQueries = imageQueries.map((url) => url.trim()).filter(Boolean);

  if (validImageQueries.length > 0 && isImageEmbeddingModel(embeddingModel)) {
    const imageInputs = (
      await Promise.all(
        validImageQueries.map(async (url, index) => {
          try {
            return await normalizeImageToBase64(url);
          } catch (error) {
            // Image search is additive. A stale or unreadable image should not break text recall
            // or other valid images in the same request.
            logger.warn('Image embedding normalization failed during dataset search', {
              imageIndex: index,
              error
            });
          }
        })
      )
    )
      .filter((imageUrl): imageUrl is string => typeof imageUrl === 'string' && !!imageUrl.trim())
      .map((imageUrl) => ({
        source: 'image' as const,
        input: {
          type: 'image' as const,
          input: imageUrl.trim()
        }
      }));

    vectorInputs.push(...imageInputs);
  }

  if (vectorInputs.length === 0) {
    return {
      tasks: [],
      tokens: 0
    };
  }

  const { tokens, vectors } = await getVectors({
    model: embeddingModel,
    inputs: vectorInputs.map((item) => item.input),
    type: 'query'
  });
  const tasks = vectors.map((vector, index) => ({
    source: vectorInputs[index].source,
    vector
  }));

  return {
    tasks,
    tokens
  };
};

/**
 * 执行 embedding 召回并按 query 来源分组返回。
 * 向量库返回的是 index dataId，这里需要再回查 data/collection，补齐 q/a、
 * 图片字段和来源信息。每个 query 内先按数据块去重，多个 query 之间再交给 RRF 合并。
 */
export const embeddingRecall = async ({
  teamId,
  datasetIds,
  model,
  imageQueries,
  textQueries,
  imageCaptionQueries,
  limit,
  forbidCollectionIdList,
  filterCollectionIdList
}: {
  teamId: string;
  datasetIds: string[];
  model: string;
  imageQueries: string[];
  textQueries: string[];
  imageCaptionQueries: string[];
  limit: number;
  forbidCollectionIdList: string[];
  filterCollectionIdList?: string[];
}): Promise<
  ReturnType<typeof emptyEmbeddingRecallResult> & {
    tokens: number;
  }
> => {
  if (limit === 0) {
    return {
      ...emptyEmbeddingRecallResult(),
      tokens: 0
    };
  }

  const { tasks, tokens } = await buildVectorRecallTasks({
    model,
    textQueries,
    imageCaptionQueries,
    imageQueries
  });

  if (tasks.length === 0) {
    return {
      ...emptyEmbeddingRecallResult(),
      tokens
    };
  }

  const recallResults = await Promise.all(
    tasks.map(async ({ vector }) => {
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

  const groupedRecallLists: Record<EmbeddingRecallSource, SearchDataResponseItemType[][]> = {
    text: [],
    imageCaption: [],
    image: []
  };

  recallResults.forEach((recallResult, taskIndex) => {
    const task = tasks[taskIndex];
    const set = new Set<string>();

    const list = recallResult.results
      .map((item, index) => {
        const collection = collectionMaps.get(String(item.collectionId));
        if (!collection) {
          logger.warn('Dataset collection not found during recall', {
            collectionId: item.collectionId,
            dataId: item.id
          });
          return;
        }

        const data = dataMaps.get(String(item.id?.trim()));
        if (!data) {
          logger.warn('Dataset data not found during recall', {
            dataId: item.id,
            collectionId: item.collectionId
          });
          return;
        }

        return buildSearchResultItem({
          data,
          collection,
          score: [{ type: SearchScoreTypeEnum.embedding, value: item?.score || 0, index }]
        });
      })
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
      }) as SearchDataResponseItemType[];

    groupedRecallLists[task.source].push(list);
  });

  return {
    textEmbeddingRecallResults: concatRecallLists(groupedRecallLists.text, limit),
    imageCaptionEmbeddingRecallResults: concatRecallLists(groupedRecallLists.imageCaption, limit),
    imageVectorRecallResults: concatRecallLists(groupedRecallLists.image, limit),
    tokens
  };
};
