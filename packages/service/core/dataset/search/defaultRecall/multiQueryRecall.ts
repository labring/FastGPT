import { getForbidCollectionIdList, filterCollectionByMetadata } from './collectionFilter';
import { embeddingRecall } from './embeddingRecall';
import { fullTextRecall } from './fullTextRecall';

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
  embeddingLimit,
  fullTextLimit,
  textQueries,
  imageCaptionQueries
}: {
  teamId: string;
  datasetIds: string[];
  model: string;
  imageQueries: string[];
  collectionFilterMatch?: string;
  embeddingLimit: number;
  fullTextLimit: number;
  textQueries: string[];
  imageCaptionQueries: string[];
}) => {
  const [forbidCollectionIdList, filterCollectionIdList] = await Promise.all([
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
