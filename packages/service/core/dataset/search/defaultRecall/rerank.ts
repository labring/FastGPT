import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { reRankRecall } from '../../../../core/ai/rerank';
import { concatWeightedRecallLists, removeDuplicateSearchResults } from './result';

/**
 * 构造 rerank 专用 query。召回 query 可能已经经过问题扩展和同义词改写，
 * 但 rerank 仍需要看到原始问题，避免改写后的文本替代用户真实意图。
 */
export const buildSynonymAwareRerankQuery = ({
  originalQuery,
  expandedQuery
}: {
  originalQuery?: string;
  expandedQuery: string;
}) => {
  const values = [originalQuery?.trim(), expandedQuery.trim()].filter(
    (value, index, list): value is string => !!value && list.indexOf(value) === index
  );
  return values.join('\n');
};

/**
 * 为 rerank document 附加当前 chunk 实际命中的 mapping。
 * 只使用 chunk 自身的 metadata，不把 query 命中的 mapping 混入 document。
 */
export const buildSynonymAwareRerankDocument = (item: SearchDataResponseItemType) => {
  const text = `${item.q}\n${item.a ?? ''}`.trim();
  const mappings = item.synonymMappings ?? [];
  if (mappings.length === 0) return text;

  const synonymContext = mappings
    .map(({ matchedTerm, standardizedTerm }) => `${matchedTerm} = ${standardizedTerm}`)
    .join('；');
  return `${text}\n\n同义词：${synonymContext}`;
};

const datasetDataReRank = async ({
  rerankModel,
  data,
  query,
  originalQuery
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string;
  originalQuery?: string;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  const { results, inputTokens } = await reRankRecall({
    model: rerankModel,
    query: buildSynonymAwareRerankQuery({ originalQuery, expandedQuery: query }),
    documents: data.map((item) => ({
      id: item.id,
      text: buildSynonymAwareRerankDocument(item)
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
  originalQuery,
  rerankWeight
}: {
  usingReRank: boolean;
  textRecallResults: SearchDataResponseItemType[];
  rerankModel?: RerankModelItemType;
  query: string;
  originalQuery?: string;
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
      originalQuery,
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
