import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { reRankRecall } from '../../../../core/ai/rerank';
import { concatWeightedRecallLists, removeDuplicateSearchResults } from './result';

const datasetDataReRank = async ({
  rerankModel,
  data,
  query
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  const { results, inputTokens } = await reRankRecall({
    model: rerankModel,
    query,
    documents: data.map((item) => ({
      id: item.id,
      text: `${item.q}\n${item.a}`.trim()
    }))
  });

  if (results.length === 0) {
    return Promise.reject('Rerank error');
  }

  // add new score to data
  const mergeResult = results
    .map((item, index) => {
      const target = data.find((dataItem) => dataItem.id === item.id);
      if (!target) return null;
      const score = item.score || 0;

      return {
        ...target,
        score: [{ type: SearchScoreTypeEnum.reRank, value: score, index }]
      };
    })
    .filter(Boolean) as SearchDataResponseItemType[];

  return {
    results: mergeResult,
    inputTokens
  };
};

/**
 * 只对文本召回结果 rerank。图片召回仍通过 RRF 权重参与最终融合，避免图片向量结果被文本 rerank 误杀。
 */
export const reRankSearchResults = async ({
  usingReRank,
  textRecallResults,
  rerankModel,
  query,
  rerankWeight
}: {
  usingReRank: boolean;
  textRecallResults: SearchDataResponseItemType[];
  rerankModel?: RerankModelItemType;
  query: string;
  rerankWeight: number;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
  usingReRank: boolean;
}> => {
  if (!usingReRank || !query || textRecallResults.length === 0) {
    return {
      results: textRecallResults,
      inputTokens: 0,
      usingReRank: false
    };
  }

  try {
    const { results: reRankResults, inputTokens } = await datasetDataReRank({
      rerankModel,
      query,
      data: removeDuplicateSearchResults(textRecallResults)
    });

    if (rerankWeight === 1) {
      return {
        results: reRankResults,
        inputTokens,
        usingReRank: true
      };
    }

    return {
      results: concatWeightedRecallLists([
        { weight: 1 - rerankWeight, list: textRecallResults },
        { weight: rerankWeight, list: reRankResults }
      ]),
      inputTokens,
      usingReRank: true
    };
  } catch {
    return {
      results: textRecallResults,
      inputTokens: 0,
      usingReRank: false
    };
  }
};
