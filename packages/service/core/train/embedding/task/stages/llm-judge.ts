import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { judgeRelevantChunks } from '../../external';
import { computeRankingMetrics } from '../../../common/metrics/rankingMetrics';
import type { RankingCase } from '../../../common/metrics/rankingMetrics';
import { pLimit } from '../../../common/utils';
import { trainEnv } from '../../../common/env';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';
import { getDefaultLLMModel } from '../../../../ai/model';

const K_VALUES = [5, 10, 15];

/**
 * Stage 7: LLM Judge (Embedding)
 *
 * Uses DiTing detect-context API to determine which chunks from the combined
 * baseline + tuned top-K retrieval lists truly answer each query.
 * Replaces the original expectedContextIds with LLM-detected relevant IDs
 * and recomputes MRR/NDCG metrics for both models.
 *
 * Key difference from rerank: chunk content is sourced from rankingResults[].chunks
 * (stored during embedding evaluation), not from retrievalContextsFull.
 *
 * @param task - Embedding training task (after stage 6 completion)
 * @returns Judged expected IDs and re-evaluated metrics
 */
export async function runLLMJudgeStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  judgedExpectedIds: Array<{ itemId: string; expectedIds: string[] }>;
  baseModelRejudgedResult: ReturnType<typeof computeRankingMetrics>;
  tunedModelRejudgedResult: ReturnType<typeof computeRankingMetrics>;
}> {
  addLog.info('Run LLM judge stage (embedding)', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.llm_judge,
      EmbeddingTrainErrEnum.embeddingLLMJudgeNoEvalData,
      EmbeddingTrainSuggestionEnum.embeddingLLMJudgeNoEvalData
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const baselineRanking = task.checkpoint.data?.eval_basemodel?.rankingResults;
  const tunedRanking = task.checkpoint.data?.eval_tunedmodel?.rankingResults;

  if (!baselineRanking?.length || !tunedRanking?.length) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.llm_judge,
      EmbeddingTrainErrEnum.embeddingLLMJudgeNoRankingResults,
      EmbeddingTrainSuggestionEnum.embeddingLLMJudgeNoRankingResults
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Build lookup maps: itemId -> { rankedIds, chunks }
  const baselineMap = new Map(
    baselineRanking.map((r) => [r.itemId, { rankedIds: r.rankedIds, chunks: r.chunks }])
  );
  const tunedMap = new Map(
    tunedRanking.map((r) => [r.itemId, { rankedIds: r.rankedIds, chunks: r.chunks }])
  );

  // Read eval dataset data for question text
  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.llm_judge,
      EmbeddingTrainErrEnum.embeddingLLMJudgeNoEvalData,
      EmbeddingTrainSuggestionEnum.embeddingLLMJudgeNoEvalData
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Build question lookup
  const questionMap = new Map(
    evalDataItems.map((item: any) => [item._id.toString(), item.userInput ?? ''])
  );

  const topK = trainEnv.LLM_JUDGE_TOP_K;
  const defaultModel = getDefaultLLMModel();

  // Collect items that have both baseline and tuned ranking results
  const judgeItems: Array<{
    itemId: string;
    question: string;
    retrieval_reference_list: Array<{ id: string; q: string; a: string }>;
    baselineRankedIds: string[];
    tunedRankedIds: string[];
  }> = [];

  for (const [itemId, baselineData] of baselineMap) {
    const tunedData = tunedMap.get(itemId);
    if (!tunedData) continue;

    const question = questionMap.get(itemId);
    if (!question) continue;

    // Merge top K IDs from baseline and tuned, dedup
    const mergedIds = Array.from(
      new Set([...baselineData.rankedIds.slice(0, topK), ...tunedData.rankedIds.slice(0, topK)])
    );

    // Build chunk content lookup from both ranking results
    const chunkContentMap = new Map<string, { q: string; a: string }>();
    for (const c of baselineData.chunks) {
      chunkContentMap.set(c.id, { q: c.q ?? '', a: c.a ?? '' });
    }
    for (const c of tunedData.chunks) {
      if (!chunkContentMap.has(c.id)) {
        chunkContentMap.set(c.id, { q: c.q ?? '', a: c.a ?? '' });
      }
    }

    const retrieval_reference_list = mergedIds
      .map((id) => {
        const chunk = chunkContentMap.get(id);
        return { id, q: chunk?.q ?? '', a: chunk?.a ?? '' };
      })
      .filter((c) => c.q.length > 0 || c.a.length > 0);

    if (retrieval_reference_list.length === 0) continue;

    judgeItems.push({
      itemId,
      question,
      retrieval_reference_list,
      baselineRankedIds: baselineData.rankedIds,
      tunedRankedIds: tunedData.rankedIds
    });
  }

  if (judgeItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.llm_judge,
      EmbeddingTrainErrEnum.embeddingLLMJudgeEmptyResult,
      EmbeddingTrainSuggestionEnum.embeddingLLMJudgeEmptyResult
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('LLM judge items prepared (embedding)', {
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
          addLog.info('LLM judge progress (embedding)', {
            taskId: String(task._id),
            completed: completedCount,
            total: totalCount
          });
        }

        if (response.status !== 'success') {
          addLog.warn('LLM judge failed for item (embedding)', {
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

  // Collect successful results
  const successfulResults = judgeResults
    .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((v) => v !== null);

  const failedCount = judgeResults.length - successfulResults.length;
  if (failedCount > 0) {
    addLog.warn('Some LLM judge requests failed (embedding)', {
      taskId: String(task._id),
      total: judgeResults.length,
      failed: failedCount
    });
  }

  if (successfulResults.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.llm_judge,
      EmbeddingTrainErrEnum.embeddingLLMJudgeDiTingFailed,
      EmbeddingTrainSuggestionEnum.embeddingLLMJudgeDiTingFailed
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  addLog.info('LLM judge completed (embedding)', {
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
  const baseModelRejudgedResult = computeRankingMetrics(baselineCases, K_VALUES, 'embed');

  // Recompute tuned metrics
  const tunedCases: RankingCase[] = successfulResults.map((r) => ({
    rankedIds: r.tunedRankedIds,
    expectedIds: r.expectedIds
  }));
  const tunedModelRejudgedResult = computeRankingMetrics(tunedCases, K_VALUES, 'embed');

  addLog.info('LLM judge stage completed (embedding)', {
    taskId: String(task._id),
    judgedItemCount: successfulResults.length,
    baseMrr10: baseModelRejudgedResult.detailed_results.embed_top10_mrr,
    tunedMrr10: tunedModelRejudgedResult.detailed_results.embed_top10_mrr
  });

  return {
    judgedExpectedIds,
    baseModelRejudgedResult,
    tunedModelRejudgedResult
  };
}
