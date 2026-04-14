import type { RerankEvalResult } from '@fastgpt/global/core/train/rerank/type';
import type { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { evaluateRerankModel } from '../../external';
import { getRerankModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import { buildModelEndpoint } from '../../utils';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../../../common/errors';

/**
 * Evaluate a rerank model on the given evaluation dataset
 *
 * Shared implementation used by both eval_basemodel and eval_tunedmodel stages.
 *
 * @param taskId - Training task ID (for logging)
 * @param evalDatasetId - Evaluation dataset collection ID
 * @param modelId - Model ID (RerankModelItemType.model) to evaluate
 * @param stage - Checkpoint stage enum, used for error attribution
 * @returns Full runLogs including retrieval_ranks for CSV download
 */
export async function evaluateRerankModelHelper(
  taskId: string,
  evalDatasetId: string,
  modelId: string,
  stage: RerankTaskCheckpointStageEnum
): Promise<RerankEvalResult> {
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

  const modelConfig = getRerankModel(modelId);

  if (!modelConfig) {
    const enhancedError = createRerankEnhancedError(
      stage,
      RerankTrainErrEnum.rerankEvalModelNotFound,
      RerankTrainSuggestionEnum.rerankEvalModelNotFound,
      modelId
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const dataset = evalDataItems.map((item) => ({
    q: item.userInput,
    retrieval_reference_list: (item.retrievalContextsFull || []).map((ctx) => ({
      id: ctx.id,
      q: ctx.q,
      a: ctx.a || '',
      score: ctx.score
    })),
    expected_dataid: item.expectedContextIds || []
  }));

  const modelEndpoint = buildModelEndpoint(modelConfig);
  const rerankerConfig = {
    name: modelEndpoint.model,
    base_url: modelEndpoint.base_url,
    api_key: modelEndpoint.api_key
  };

  const response = await evaluateRerankModel({
    dataset,
    reranker_config: rerankerConfig,
    metric_config: {
      metric_name: 'rerank_metric'
    }
  });

  if (!response.success || !response.data?.runLogs?.detailed_results) {
    const enhancedError = createRerankEnhancedError(
      stage,
      RerankTrainErrEnum.rerankEvalDitingEvalFailed,
      RerankTrainSuggestionEnum.rerankEvalDitingEvalFailed,
      response.error
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  const runLogs = response.data.runLogs;
  const detailedResults = runLogs.detailed_results;

  addLog.info('Rerank model evaluated', {
    taskId,
    modelId,
    stage,
    ndcg: detailedResults.rerank_top10_ndcg,
    mrr: detailedResults.rerank_top10_mrr,
    precision: detailedResults.rerank_top10_precision,
    hasRetrievalRanks: !!runLogs.retrieval_ranks
  });

  return runLogs;
}
