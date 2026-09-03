import { getForbidCollectionIdList, filterCollectionByMetadata } from './collectionFilter';
import { embeddingRecall } from './embeddingRecall';
import { fullTextRecall } from './fullTextRecall';
import type { EmbeddingSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

/**
 * 默认召回的并行调度层。
 * 这里先统一计算 forbid collection 与 metadata filter，再把同一份 collection 约束
 * 下发给 embedding/full-text 两条召回链路，保证两种召回方式看到的集合范围一致。
 */
export const multiQueryRecall = async ({
  teamId,
  datasetIds,
  model,
  imageQueries,
  collectionFilterMatch,
  readableCollectionIdList,
  embeddingLimit,
  fullTextLimit,
  textQueries,
  imageCaptionQueries
}: {
  teamId: string;
  datasetIds: string[];
  model: EmbeddingSystemModelDataType;
  imageQueries: string[];
  collectionFilterMatch?: string;
  readableCollectionIdList?: string[];
  embeddingLimit: number;
  fullTextLimit: number;
  textQueries: string[];
  imageCaptionQueries: string[];
}) => {
  const [forbidCollectionIdList, metadataFilterCollectionIdList] = await Promise.all([
    getForbidCollectionIdList({
      teamId,
      datasetIds
    }),
    filterCollectionByMetadata({
      teamId,
      datasetIds,
      collectionFilterMatch
    })
  ]);

  // 权限可读集合 ∩ 用户 metadata 过滤集合 → 有效过滤集合（AND 语义）。
  // 两者均未定义 → 不设 collectionId 过滤（undefined）；交集为空 → 直接返回空结果（跳过向量召回）。
  let filterCollectionIdList: string[] | undefined;
  if (readableCollectionIdList && metadataFilterCollectionIdList) {
    const readableSet = new Set(readableCollectionIdList);
    filterCollectionIdList = metadataFilterCollectionIdList.filter((id) => readableSet.has(id));
  } else {
    filterCollectionIdList = readableCollectionIdList ?? metadataFilterCollectionIdList;
  }

  if (filterCollectionIdList && filterCollectionIdList.length === 0) {
    return {
      tokens: 0,
      textEmbeddingRecallResults: [],
      imageCaptionEmbeddingRecallResults: [],
      imageVectorRecallResults: [],
      textFullTextRecallResults: [],
      imageCaptionFullTextRecallResults: []
    };
  }

  const [
    {
      tokens,
      textEmbeddingRecallResults,
      imageCaptionEmbeddingRecallResults,
      imageVectorRecallResults
    },
    { textFullTextRecallResults, imageCaptionFullTextRecallResults }
  ] = await Promise.all([
    embeddingRecall({
      teamId,
      datasetIds,
      model,
      imageQueries,
      textQueries,
      imageCaptionQueries,
      limit: embeddingLimit,
      forbidCollectionIdList,
      filterCollectionIdList
    }),
    fullTextRecall({
      teamId,
      datasetIds,
      queryGroups: [
        { source: 'text', queries: textQueries },
        { source: 'imageCaption', queries: imageCaptionQueries }
      ],
      limit: fullTextLimit,
      filterCollectionIdList,
      forbidCollectionIdList
    })
  ]);

  return {
    tokens,
    textEmbeddingRecallResults,
    imageCaptionEmbeddingRecallResults,
    imageVectorRecallResults,
    textFullTextRecallResults,
    imageCaptionFullTextRecallResults
  };
};
