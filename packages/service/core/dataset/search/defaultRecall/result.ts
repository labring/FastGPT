import { hashStr } from '@fastgpt/global/common/string/tools';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { formatDatasetDataValue } from '../../data/controller';

/**
 * 把召回命中的 data 与 collection 统一整理成搜索结果。
 * embedding/full-text 召回只负责生成各自的 score，展示字段和来源字段在这里保持一致。
 */
export const buildSearchResultItem = ({
  data,
  collection,
  score,
  includeIndexes = false
}: {
  data: DatasetDataSchemaType;
  collection: DatasetCollectionSchemaType;
  score: SearchDataResponseItemType['score'];
  includeIndexes?: boolean;
}): SearchDataResponseItemType => ({
  id: String(data._id),
  updateTime: data.updateTime,
  ...formatDatasetDataValue({
    q: data.q,
    a: data.a,
    imageId: data.imageId,
    imageDescMap: data.imageDescMap
  }),
  chunkIndex: data.chunkIndex,
  ...(includeIndexes ? { indexes: data.indexes } : {}),
  datasetId: String(data.datasetId),
  collectionId: String(data.collectionId),
  ...getCollectionSourceData(collection),
  score
});

export const concatRecallLists = (lists: SearchDataResponseItemType[][], limit: number) => {
  return datasetSearchResultConcat(lists.map((list) => ({ weight: 1, list }))).slice(0, limit);
};

export const concatWeightedRecallLists = (
  lists: { weight: number; list: SearchDataResponseItemType[] }[]
) => {
  return datasetSearchResultConcat(lists.filter((item) => item.weight > 0 && item.list.length > 0));
};

/**
 * 按 q+a 内容去重。召回链路里同一文本块可能同时被文本、图片描述、图片向量命中，
 * 这里用归一化后的内容 hash 保留最前面的排序结果。
 */
export const removeDuplicateSearchResults = (data: SearchDataResponseItemType[]) => {
  const set = new Set<string>();

  return data.filter((item) => {
    // 删除所有的标点符号与空格等，只对文本进行比较
    const str = hashStr(`${item.q}${item.a}`.replace(/[^\p{L}\p{N}]/gu, ''));
    if (set.has(str)) return false;
    set.add(str);
    return true;
  });
};

export const filterSearchResultsByScore = ({
  data,
  usingReRank,
  searchMode,
  similarity
}: {
  data: SearchDataResponseItemType[];
  usingReRank: boolean;
  searchMode: DatasetSearchModeEnum;
  similarity: number;
}) => {
  const scoreType = usingReRank
    ? SearchScoreTypeEnum.reRank
    : searchMode === DatasetSearchModeEnum.embedding
      ? SearchScoreTypeEnum.embedding
      : undefined;

  if (!scoreType) {
    return {
      results: data,
      usingSimilarityFilter: false
    };
  }

  return {
    results: data.filter((item) => {
      const targetScore = item.score.find((item) => item.type === scoreType);
      return !targetScore || targetScore.value >= similarity;
    }),
    usingSimilarityFilter: true
  };
};
