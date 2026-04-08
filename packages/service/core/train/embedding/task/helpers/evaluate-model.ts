import type { EmbeddingEvalResult } from '@fastgpt/global/core/train/embedding/type';
import type { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { MongoEvalDatasetData } from '../../../../../core/evaluation/dataset/evalDatasetDataSchema';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { evaluateEmbeddingModel } from '../../external';
import { getEmbeddingModel } from '../../../../ai/model';
import { addLog } from '../../../../../common/system/log';
import { buildModelEndpoint } from '../../utils';
import { TrainTaskUnrecoverableError, TrainTaskRetriableError } from '../errors';

/**
 * Evaluate an embedding model on the given evaluation dataset
 *
 * Shared implementation used by both eval_basemodel and eval_tunedmodel stages.
 * Key difference from rerank: only uses expected_dataid, no retrieval_reference_list
 *
 * @param taskId - Training task ID (for logging)
 * @param evalDatasetId - Evaluation dataset collection ID
 * @param modelId - Model ID to evaluate
 * @param stage - Checkpoint stage enum, used for error attribution
 * @returns Full runLogs with embedding evaluation results
 */
export async function evaluateEmbeddingModelHelper(
  taskId: string,
  evalDatasetId: string,
  modelId: string,
  stage: EmbeddingTaskCheckpointStageEnum
): Promise<EmbeddingEvalResult> {
  addLog.info('Evaluate embedding model', { taskId, modelId, stage });

  const evalDataItems = await MongoEvalDatasetData.find({
    evalDatasetCollectionId: evalDatasetId
  }).lean();

  if (evalDataItems.length === 0) {
    const enhancedError = createEmbeddingEnhancedError(
      stage,
      EmbeddingTrainErrEnum.evalDatasetEmptyBeforeEval,
      EmbeddingTrainSuggestionEnum.evalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const modelConfig = getEmbeddingModel(modelId);

  if (!modelConfig) {
    const enhancedError = createEmbeddingEnhancedError(
      stage,
      EmbeddingTrainErrEnum.evalModelNotFound,
      EmbeddingTrainSuggestionEnum.evalModelNotFound,
      modelId
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  // Key difference: embedding only uses expected_dataid, no retrieval_reference_list
  const dataset = evalDataItems.map((item) => ({
    q: item.userInput,
    expected_dataid: item.expectedContextIds || []
  }));

  const modelEndpoint = buildModelEndpoint(modelConfig);

  const response = await evaluateEmbeddingModel({
    dataset: dataset,
    embedding_config: {
      name: modelEndpoint.model,
      base_url: modelEndpoint.base_url,
      api_key: modelEndpoint.api_key
    }
  });

  if (!response.success || !response.data?.runLogs?.detailed_results) {
    const enhancedError = createEmbeddingEnhancedError(
      stage,
      EmbeddingTrainErrEnum.evalDitingEvalFailed,
      EmbeddingTrainSuggestionEnum.evalDitingEvalFailed,
      response.error
    );
    throw new TrainTaskRetriableError(enhancedError);
  }

  const runLogs = response.data.runLogs;
  const detailedResults = runLogs.detailed_results;

  addLog.info('Embedding model evaluated', {
    taskId,
    modelId,
    stage,
    mrr: detailedResults.embed_top10_mrr,
    precision: detailedResults.embed_top10_precision
  });

  return runLogs;
}
