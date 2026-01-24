/**
 * Assistant专用的Reranker策略实现
 *
 * 支持两种重排策略:
 * 1. concat: 拼接策略 - 将多个query用\n拼接后一起rerank(默认)
 * 2. maxScore: 最高分策略 - 每个query单独rerank,每个chunk取最高分
 */

import { addLog } from '../../../common/system/log';
import { reRankRecall } from '../../ai/rerank';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import {
  RerankMethodEnum,
  RerankStrategyEnum,
  SearchScoreTypeEnum
} from '@fastgpt/global/core/dataset/constants';

/**
 * Assistant场景的Reranker - 支持多种策略
 */
export const assistantDatasetReRank = async ({
  rerankModel,
  data,
  query,
  rerankMethod = RerankMethodEnum.content,
  rerankStrategy = RerankStrategyEnum.concat // 默认使用拼接策略
}: {
  rerankModel?: RerankModelItemType;
  data: SearchDataResponseItemType[];
  query: string; // 多个query用\n拼接的字符串
  rerankMethod?: RerankMethodEnum;
  rerankStrategy?: RerankStrategyEnum;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  addLog.info('Assistant Rerank Start', {
    query,
    rerankMethod,
    rerankStrategy,
    rerankModel: rerankModel?.name,
    dataCount: data.length
  });

  // 准备文档数据
  const documents = data.map((item) => {
    let text = '';
    switch (rerankMethod) {
      case RerankMethodEnum.question:
        text = item.q;
        break;
      case RerankMethodEnum.content:
      default:
        text = `${item.q}\n${item.a}`;
    }
    return { id: item.id, text };
  });

  let results: { id: string; score?: number }[] = [];
  let totalInputTokens = 0;

  // 根据策略执行rerank
  if (rerankStrategy === RerankStrategyEnum.maxScore) {
    // 策略2: 最高分策略 - 将query按换行符拆分,每个query单独rerank,取最高分
    const queries = query.split('\n').filter((q) => q.trim().length > 0);

    addLog.info('Rerank Strategy: MaxScore', {
      queryCount: queries.length,
      queries
    });

    // 为每个query执行rerank
    const allRerankResults = await Promise.all(
      queries.map(async (singleQuery) => {
        const { results: queryResults, inputTokens } = await reRankRecall({
          model: rerankModel,
          query: singleQuery,
          documents
        });
        return { results: queryResults, inputTokens };
      })
    );

    // 汇总token消耗
    totalInputTokens = allRerankResults.reduce((sum, r) => sum + r.inputTokens, 0);

    // 为每个chunk选择最高分
    const scoreMap = new Map<string, number>();
    for (const { results: queryResults } of allRerankResults) {
      for (const item of queryResults) {
        const currentScore = scoreMap.get(item.id) || 0;
        const newScore = item.score || 0;
        if (newScore > currentScore) {
          scoreMap.set(item.id, newScore);
        }
      }
    }

    // 构建最终结果,按分数排序
    results = Array.from(scoreMap.entries())
      .map(([id, score]) => ({ id, score }))
      .sort((a, b) => (b.score || 0) - (a.score || 0));

    addLog.info('Rerank MaxScore Strategy Result', {
      totalQueries: queries.length,
      totalInputTokens,
      resultCount: results.length,
      topScores: results.slice(0, 5).map((r) => ({ id: r.id, score: r.score }))
    });
  } else if (rerankStrategy === RerankStrategyEnum.concat) {
    // 策略1: 拼接策略 - 使用拼接后的query直接rerank
    addLog.info('Rerank Strategy: Concat', {
      query
    });

    const { results: rerankResults, inputTokens } = await reRankRecall({
      model: rerankModel,
      query,
      documents
    });

    results = rerankResults;
    totalInputTokens = inputTokens;

    addLog.info('Rerank Concat Strategy Result', {
      totalInputTokens,
      resultCount: results.length,
      topScores: results.slice(0, 5).map((r) => ({ id: r.id, score: r.score }))
    });
  }

  if (results.length === 0) {
    return Promise.reject('Assistant rerank error: no results');
  }

  // 将rerank分数添加到数据中
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

  addLog.info('Assistant Rerank Completed', {
    strategy: rerankStrategy,
    inputTokens: totalInputTokens,
    resultCount: mergeResult.length
  });

  return {
    results: mergeResult,
    inputTokens: totalInputTokens
  };
};
