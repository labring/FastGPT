import { hashStr } from '@fastgpt/global/common/string/tools';
import { DatasetSearchModeEnum, SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { datasetSearchResultConcat } from '@fastgpt/global/core/dataset/search/utils';
import type {
  DatasetCollectionSchemaType,
  DatasetDataSchemaType,
  SearchDataResponseItemType
} from '@fastgpt/global/core/dataset/type';
import { formatDatasetDataTextValue } from '../../data/controller';

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
}): SearchDataResponseItemType => {
  const formattedValue = formatDatasetDataTextValue({
    q: data.q,
    a: data.a,
    imageDescMap: data.imageDescMap
  });

  return {
    id: String(data._id),
    updateTime: data.updateTime,
    ...formattedValue,
    imageId: data.imageId,
    chunkIndex: data.chunkIndex,
    ...(includeIndexes ? { indexes: data.indexes } : {}),
    ...(data.metadata ? { metadata: data.metadata } : {}),
    datasetId: String(data.datasetId),
    collectionId: String(data.collectionId),
    ...getCollectionSourceData(collection),
    score
  };
};

export const concatRecallLists = (lists: SearchDataResponseItemType[][], limit: number) => {
  return datasetSearchResultConcat(lists.map((list) => ({ weight: 1, list }))).slice(0, limit);
};

export const concatWeightedRecallLists = (
  lists: { weight: number; list: SearchDataResponseItemType[] }[]
) => {
  return datasetSearchResultConcat(lists.filter((item) => item.weight > 0 && item.list.length > 0));
};

/**
 * 按归一化文本和原始图片身份去重，保留最前面的排序结果。
 * 同一块的多路命中仍合并；不同图片即使描述相同或为空，也不能互相覆盖。
 * 图片 key/URL 必须完整比较，且此时尚未签发预览链接，避免临时 URL 干扰去重。
 */
export const removeDuplicateSearchResults = (data: SearchDataResponseItemType[]) => {
  const set = new Set<string>();

  return data.filter((item) => {
    // 文本保留原有标点/空白归一化规则；可选回答为空时不拼入字面量 undefined。
    const text = `${item.q}${item.a ?? ''}`.replace(/[^\p{L}\p{N}]/gu, '');
    // 归一化文本不含冒号，首个冒号可唯一确定字段边界，无需 JSON 序列化。
    const str = hashStr(`${text}:${item.imageId ?? ''}`);
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
