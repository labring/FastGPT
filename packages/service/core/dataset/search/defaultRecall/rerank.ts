import { performance } from 'node:perf_hooks';
import { SearchScoreTypeEnum } from '@fastgpt/global/core/dataset/constants';
import type { RerankModelDataType } from '@fastgpt/global/core/ai/model/schema';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { normalizeRerankCandidateNum } from '@fastgpt/global/core/dataset/search/utils';
import { concatWeightedRecallLists, removeDuplicateSearchResults } from './result';
import { rerankDatasetWithSynonyms } from '../../synonym/rerank';
import {
  patchPerfContext,
  recordPerfPoint,
  trackPerfStage
} from '../../../../common/opsPerf/context';

const datasetDataReRank = async ({
  rerankModel,
  data,
  query,
  teamId,
  onSynonymTriggered
}: {
  rerankModel?: RerankModelDataType;
  data: SearchDataResponseItemType[];
  query: string;
  teamId: string;
  onSynonymTriggered?: () => void;
}): Promise<{
  results: SearchDataResponseItemType[];
  inputTokens: number;
}> => {
  const { results, inputTokens } = await rerankDatasetWithSynonyms({
    model: rerankModel,
    teamId,
    query,
    documents: data.map((item) => ({
      id: item.id,
      datasetId: String(item.datasetId),
      text: `${item.q}\n${item.a}`.trim()
    })),
    onSynonymTriggered
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
  rerankWeight,
  rerankCandidateNum,
  teamId
}: {
  usingReRank: boolean;
  textRecallResults: SearchDataResponseItemType[];
  rerankModel?: RerankModelDataType;
  query: string;
  rerankWeight: number;
  rerankCandidateNum?: number;
  teamId: string;
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

  // mixed 模式先完成 embedding/fullText 的 RRF 融合，再在这里按融合顺序截断；
  // 不能按单路 recall limit 截断，否则会丢掉另一路的互补候选。
  const candidates = removeDuplicateSearchResults(textRecallResults).slice(
    0,
    normalizeRerankCandidateNum(rerankCandidateNum)
  );
  const rerankModelLabel = rerankModel?.model || rerankModel?.name || 'unknown';
  const rerankStart = performance.now();
  let hasSynonym = false;

  return trackPerfStage({ domain: 'dataset.search', stage: 'rerank' }, async () => {
    try {
      const { results: reRankResults, inputTokens } = await datasetDataReRank({
        teamId,
        rerankModel,
        query,
        data: candidates,
        onSynonymTriggered: () => {
          hasSynonym = true;
          patchPerfContext({
            domain: 'dataset.search',
            detail: { synonymRerankTriggered: true }
          });
        }
      });
      const elapsedMs = Math.max(0, performance.now() - rerankStart);

      recordPerfPoint({
        domain: 'dataset.rerank',
        teamId,
        totalMs: elapsedMs,
        status: 'ok',
        dims: {
          model: rerankModelLabel,
          hasSynonym
        },
        metrics: {
          totalCandidates: candidates.length,
          totalInputTokens: inputTokens
        }
      });

      if (rerankWeight === 1) {
        return {
          results: reRankResults,
          inputTokens,
          usingReRank: true
        };
      }

      // 只融合送入重排的候选：超出部分没有重排分，会被按重排分过滤的阈值直接放行。
      return {
        results: concatWeightedRecallLists([
          { weight: 1 - rerankWeight, list: candidates },
          { weight: rerankWeight, list: reRankResults }
        ]),
        inputTokens,
        usingReRank: true
      };
    } catch {
      const elapsedMs = Math.max(0, performance.now() - rerankStart);
      recordPerfPoint({
        domain: 'dataset.rerank',
        teamId,
        totalMs: elapsedMs,
        status: 'degraded',
        dims: {
          model: rerankModelLabel,
          hasSynonym
        },
        metrics: {
          fallbackCount: 1,
          totalCandidates: candidates.length
        }
      });
      patchPerfContext({
        domain: 'dataset.search',
        status: 'degraded',
        errorCode: 'RERANK_FALLBACK',
        metrics: { rerankFallbackCount: 1 },
        detail: { rerankFallback: true, rerankModel: rerankModelLabel }
      });

      return {
        results: textRecallResults,
        inputTokens: 0,
        usingReRank: false
      };
    }
  });
};
