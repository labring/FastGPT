import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { MongoDatasetData } from '../../../../../core/dataset/data/schema';
import { judgeRelevantChunks } from '../../external';
import { computeRankingMetrics } from '../../../common/metrics/rankingMetrics';
import type { RankingCase } from '../../../common/metrics/rankingMetrics';
import { pLimit, propagateAbortFromResults } from '../../../common/utils';
import { trainEnv } from '../../../common/env';
import { getTrainTaskAbortSignal } from '../../../common/task-abort-signal';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { getDefaultLLMModel } from '../../../../ai/model';

const K_VALUES = [5, 10, 15];

/**
 * Stage 7: LLM Judge
 *
 * Uses DiTing detect-context API to determine which chunks from the combined
 * baseline + tuned top-K retrieval lists truly answer each query.
 * Replaces the original expectedContextIds with LLM-detected relevant IDs
 * and recomputes MRR/NDCG metrics for both models.
 *
 * @param task - Rerank training task (after stage 6 completion)
 * @returns Judged expected IDs and re-evaluated metrics
 */
export async function runLLMJudgeStage(task: RerankTrainTaskSchemaType): Promise<{
  judgedExpectedIds: Array<{ itemId: string; expectedIds: string[] }>;
  baseModelRejudgedResult: ReturnType<typeof computeRankingMetrics>;
  tunedModelRejudgedResult: ReturnType<typeof computeRankingMetrics>;
}> {
  addLog.info('Run LLM judge stage', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.llm_judge,
      RerankTrainErrEnum.rerankLLMJudgeNoEvalData,
      RerankTrainSuggestionEnum.rerankLLMJudgeNoEvalData
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const baselineRanking = task.checkpoint.data?.eval_basemodel?.rankingResults;
  const tunedRanking = task.checkpoint.data?.eval_tunedmodel?.rankingResults;

  if (!baselineRanking?.length || !tunedRanking?.length) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.llm_judge,
      RerankTrainErrEnum.rerankLLMJudgeNoRankingResults,
      RerankTrainSuggestionEnum.rerankLLMJudgeNoRankingResults
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Build lookup maps from eval data item _id to ranking data
  const baselineMap = new Map(baselineRanking.map((r) => [r.itemId, r.rankedIds]));
  const tunedMap = new Map(tunedRanking.map((r) => [r.itemId, r.rankedIds]));

  // Read eval dataset data
  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.llm_judge,
      RerankTrainErrEnum.rerankLLMJudgeNoEvalData,
      RerankTrainSuggestionEnum.rerankLLMJudgeNoEvalData
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const topK = trainEnv.LLM_JUDGE_TOP_K;
  const defaultModel = getDefaultLLMModel();

  // Build the eval data content lookup (retrievalContextsFull now only stores id+score)
  const evalDataContentMap = new Map(
    evalDataItems.map((item: any) => [
      item._id.toString(),
      {
        question: item.userInput ?? '',
        candidateIds: (item.retrievalContextsFull || []).map((c: any) => c.id)
      }
    ])
  );

  // Collect all IDs that may need q/a lookups (baseline/tuned topK merged for each item)
  const allNeededIds = new Set<string>();
  for (const [itemId, baselineIds] of baselineMap) {
    const tunedIds = tunedMap.get(itemId);
    if (!tunedIds) continue;
    const evalContent = evalDataContentMap.get(itemId);
    if (!evalContent) continue;

    const mergedIds = Array.from(
      new Set([...baselineIds.slice(0, topK), ...tunedIds.slice(0, topK)])
    );
    mergedIds.forEach((id) => allNeededIds.add(id));
  }

  // Batch fetch q/a text from original dataset data
  const dataTextMap = new Map<string, { q: string; a: string }>(
    (await MongoDatasetData.find({ _id: { $in: [...allNeededIds] } }, 'q a').lean()).map((d) => [
      String(d._id),
      d as { q: string; a: string }
    ])
  );

  // Collect items that have both baseline and tuned ranking results
  const judgeItems: Array<{
    itemId: string;
    question: string;
    retrieval_reference_list: Array<{ id: string; q: string; a: string }>;
    baselineRankedIds: string[];
    tunedRankedIds: string[];
  }> = [];

  for (const [itemId, baselineIds] of baselineMap) {
    const tunedIds = tunedMap.get(itemId);
    if (!tunedIds) continue;

    const evalContent = evalDataContentMap.get(itemId);
    if (!evalContent) continue;

    // Merge top K IDs from baseline and tuned, dedup
    const mergedIds = Array.from(
      new Set([...baselineIds.slice(0, topK), ...tunedIds.slice(0, topK)])
    );

    // Lookup chunk content from MongoDatasetData (fetched in batch above)
    const retrieval_reference_list = mergedIds
      .map((id) => {
        const doc = dataTextMap.get(id);
        return { id, q: doc?.q ?? '', a: doc?.a ?? '' };
      })
      .filter((c) => c.q.length > 0 || c.a.length > 0);

    if (retrieval_reference_list.length === 0) continue;

    judgeItems.push({
      itemId,
      question: evalContent.question,
      retrieval_reference_list,
      baselineRankedIds: baselineIds,
      tunedRankedIds: tunedIds
    });
  }

  if (judgeItems.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.llm_judge,
      RerankTrainErrEnum.rerankLLMJudgeEmptyResult,
      RerankTrainSuggestionEnum.rerankLLMJudgeEmptyResult
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('LLM judge items prepared', {
    taskId: String(task._id),
    totalEvalItems: evalDataItems.length,
    judgeItems: judgeItems.length,
    topK
  });

  // Call DiTing detect-context API with controlled concurrency
  const concurrency = Math.min(
    Math.max(trainEnv.DITING_API_CONCURRENCY, 1),
    trainEnv.DITING_MAX_CONCURRENCY
  );
  const limit = pLimit(concurrency);

  let completedCount = 0;
  const totalCount = judgeItems.length;
  const PROGRESS_INTERVAL = Math.max(1, Math.floor(totalCount / 10));

  const judgeResults = await Promise.allSettled(
    judgeItems.map((item) =>
      limit(async () => {
        const abortReason = await getTrainTaskAbortSignal({
          type: 'rerank',
          taskId: String(task._id)
        });
        if (abortReason === 'deleted') {
          const enhancedError = createRerankEnhancedError(
            RerankTaskCheckpointStageEnum.llm_judge,
            RerankTrainErrEnum.rerankTaskNotExist,
            RerankTrainSuggestionEnum.rerankTaskNotExist
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }
        if (abortReason === 'cancelled') {
          const enhancedError = createRerankEnhancedError(
            RerankTaskCheckpointStageEnum.llm_judge,
            RerankTrainErrEnum.rerankFinetuneCancelled,
            RerankTrainSuggestionEnum.rerankFinetuneCancelled
          );
          throw new TrainTaskUnrecoverableError(enhancedError);
        }

        const response = await judgeRelevantChunks({
          question: item.question,
          retrieval_reference_list: item.retrieval_reference_list,
          llm_config: {
            name: defaultModel?.model ?? '',
            base_url: defaultModel?.requestUrl ?? '',
            api_key: defaultModel?.requestAuth ?? ''
          }
        });

        completedCount++;
        if (completedCount % PROGRESS_INTERVAL === 0 || completedCount === totalCount) {
          addLog.info('LLM judge progress', {
            taskId: String(task._id),
            completed: completedCount,
            total: totalCount
          });
        }

        if (response.status !== 'success') {
          addLog.warn('LLM judge failed for item', {
            taskId: String(task._id),
            itemId: item.itemId,
            error: response.error
          });
          return null;
        }

        return {
          itemId: item.itemId,
          expectedIds: response.detected_data_ids ?? [],
          baselineRankedIds: item.baselineRankedIds,
          tunedRankedIds: item.tunedRankedIds
        };
      })
    )
  );

  propagateAbortFromResults(judgeResults);

  // Collect successful results
  const successfulResults = judgeResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v) => v !== null);

  const failedCount = judgeResults.length - successfulResults.length;
  if (failedCount > 0) {
    addLog.warn('Some LLM judge requests failed', {
      taskId: String(task._id),
      total: judgeResults.length,
      failed: failedCount
    });
  }

  if (successfulResults.length === 0) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.llm_judge,
      RerankTrainErrEnum.rerankLLMJudgeDiTingFailed,
      RerankTrainSuggestionEnum.rerankLLMJudgeDiTingFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('LLM judge completed', {
    taskId: String(task._id),
    successfulResults: successfulResults.length,
    failedCount
  });

  // Build judged expected IDs
  const judgedExpectedIds = successfulResults.map((r) => ({
    itemId: r.itemId,
    expectedIds: r.expectedIds
  }));

  // Recompute baseline metrics
  const baselineCases: RankingCase[] = successfulResults.map((r) => ({
    rankedIds: r.baselineRankedIds,
    expectedIds: r.expectedIds
  }));
  const baseModelRejudgedResult = computeRankingMetrics(baselineCases, K_VALUES, 'rerank');

  // Recompute tuned metrics
  const tunedCases: RankingCase[] = successfulResults.map((r) => ({
    rankedIds: r.tunedRankedIds,
    expectedIds: r.expectedIds
  }));
  const tunedModelRejudgedResult = computeRankingMetrics(tunedCases, K_VALUES, 'rerank');

  addLog.info('LLM judge stage completed', {
    taskId: String(task._id),
    judgedItemCount: successfulResults.length,
    baseMrr10: baseModelRejudgedResult.detailed_results.rerank_top10_mrr,
    tunedMrr10: tunedModelRejudgedResult.detailed_results.rerank_top10_mrr
  });

  return {
    judgedExpectedIds,
    baseModelRejudgedResult,
    tunedModelRejudgedResult
  };
}
