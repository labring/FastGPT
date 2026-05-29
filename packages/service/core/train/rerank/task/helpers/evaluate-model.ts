import type { RerankEvalResult } from '@fastgpt/global/core/train/rerank/type';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { MongoDatasetData } from '../../../../../core/dataset/data/schema';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { getRerankModelById } from '../../../../ai/model';
import { reRankRecall } from '../../../../ai/rerank';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError } from '../../../common/errors';
import { computeRankingMetrics } from '../../../common/metrics/rankingMetrics';
import { pLimit } from '../../../common/utils';
import { trainEnv } from '../../../common/env';

const K_VALUES = [5, 10, 15];

/**
 * Evaluate a rerank model on the given evaluation dataset
 *
 * Replaces the previous DiTing-based evaluation.
 * For each query in the eval dataset:
 *   1. Reads the pre-stored retrievalContextsFull (embedding search results from eval data generation)
 *   2. Calls reRankRecall with the specific rerank model to reorder the candidates
 *   3. Extracts the ordered document ID list from reranked results
 *   4. Computes MRR, NDCG, MAP, Precision@K using computeRankingMetrics
 *
 * @param taskId        - Training task ID (for logging)
 * @param evalDatasetId - Evaluation dataset collection ID
 * @param modelId       - Model ID (RerankModelItemType.model) to evaluate
 * @param stage         - Checkpoint stage enum, used for error attribution
 */
export async function evaluateRerankModelHelper(
  taskId: string,
  evalDatasetId: string,
  modelId: string,
  stage: RerankTaskCheckpointStageEnum
): Promise<{
  evalResult: RerankEvalResult;
  rankingResults: Array<{ itemId: string; rankedIds: string[] }>;
}> {
  addLog.info('Evaluate rerank model', { taskId, modelId, stage });

  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createRerankEnhancedError(
      stage,
      RerankTrainErrEnum.rerankEvalDatasetEmptyBeforeEval,
      RerankTrainSuggestionEnum.rerankEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const modelConfig = getRerankModelById(modelId);
  if (!modelConfig) {
    const enhancedError = createRerankEnhancedError(
      stage,
      RerankTrainErrEnum.rerankEvalModelNotFound,
      RerankTrainSuggestionEnum.rerankEvalModelNotFound,
      modelId
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Filter out eval items that have no candidate list (cannot evaluate when retrievalContextsFull is empty)
  const validItems = evalDataItems.filter((item) => (item.retrievalContextsFull || []).length > 0);

  if (validItems.length === 0) {
    addLog.warn('No valid eval items with retrievalContextsFull, returning zero metrics', {
      taskId,
      totalItems: evalDataItems.length
    });
    return {
      evalResult: computeRankingMetrics([], K_VALUES, 'rerank') as RerankEvalResult,
      rankingResults: []
    };
  }

  // Batch fetch q/a text from original dataset data (retrievalContextsFull now only stores id+score)
  const allCandidateIds = [
    ...new Set(validItems.flatMap((item) => (item.retrievalContextsFull || []).map((c) => c.id)))
  ];
  const dataTextMap = new Map(
    (await MongoDatasetData.find({ _id: { $in: allCandidateIds } }, 'q a').lean()).map((d) => [
      String(d._id),
      d
    ])
  );

  // Run reranker for each query with bounded concurrency to avoid overwhelming the rerank API
  const limit = pLimit(trainEnv.TRAIN_EVAL_CONCURRENCY);
  const cases = await Promise.all(
    validItems.map((item) =>
      limit(async () => {
        const query = item.userInput;
        const expectedIds = item.expectedContextIds || [];
        const candidates = item.retrievalContextsFull || [];

        try {
          const rerankResult = await reRankRecall({
            model: modelConfig,
            query,
            documents: candidates.map((c) => {
              const doc = dataTextMap.get(c.id);
              const text = [doc?.q, doc?.a].filter(Boolean).join('\n');
              return { id: c.id, text };
            })
          });

          const rankedIds = (rerankResult.results || []).map((r) => r.id);
          return { rankedIds, expectedIds };
        } catch (err) {
          addLog.warn('Rerank recall failed for query, treating as no reorder', {
            taskId,
            query: query?.substring(0, 50),
            error: err instanceof Error ? err.message : String(err)
          });
          // Fallback: preserve original embedding order
          return { rankedIds: candidates.map((c) => c.id), expectedIds };
        }
      })
    )
  );

  const metrics = computeRankingMetrics(cases, K_VALUES, 'rerank');

  const rankingResults = validItems.map((item, idx) => ({
    itemId: item._id.toString(),
    rankedIds: cases[idx].rankedIds
  }));

  addLog.info('Rerank model evaluated', {
    taskId,
    modelId,
    stage,
    mrr10: metrics.detailed_results.rerank_top10_mrr,
    ndcg10: metrics.detailed_results.rerank_top10_ndcg,
    precision10: metrics.detailed_results.rerank_top10_precision,
    hasRetrievalRanks: !!metrics.retrieval_ranks
  });

  return {
    evalResult: metrics as RerankEvalResult,
    rankingResults
  };
}
