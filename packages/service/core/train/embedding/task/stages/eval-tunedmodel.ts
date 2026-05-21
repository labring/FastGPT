import type {
  EmbeddingTrainTaskSchemaType,
  EmbeddingEvalResult
} from '@fastgpt/global/core/train/embedding/type';
import { EmbeddingTaskCheckpointStageEnum } from '@fastgpt/global/core/train/embedding/constants';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError } from '../../../common/errors';
import { evaluateEmbeddingModelHelper } from '../helpers/evaluate-model';

/**
 * Stage 6: Evaluate Tuned Model
 *
 * Evaluates the fine-tuned embedding model on the same eval dataset used for the base model,
 * to compare performance and decide whether to keep the new model.
 *
 * Key difference from rerank: uses evaluateEmbeddingModelHelper which
 * only uses expected_dataid, without retrieval_reference_list.
 *
 * @param task - Embedding training task data
 * @returns Tuned model evaluation result
 */
export async function runEvalTunedModelStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  tunedModelEvalResult: EmbeddingEvalResult;
  rankingResults: Array<{ itemId: string; rankedIds: string[] }>;
}> {
  addLog.info('Run eval tuned model stage (embedding)', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.eval_tunedmodel,
      EmbeddingTrainErrEnum.embeddingEvalDatasetEmptyBeforeEval,
      EmbeddingTrainSuggestionEnum.embeddingEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelId = task.checkpoint.data?.registering?.tunedModelId;
  if (!tunedModelId) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.eval_tunedmodel,
      EmbeddingTrainErrEnum.embeddingEvalModelNotFound,
      EmbeddingTrainSuggestionEnum.embeddingEvalModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const { evalResult: tunedModelEvalResult, rankingResults } = await evaluateEmbeddingModelHelper(
    String(task._id),
    evalDatasetId,
    tunedModelId,
    EmbeddingTaskCheckpointStageEnum.eval_tunedmodel,
    task.teamId,
    task.tmbId,
    task.datasetIds
  );

  return { tunedModelEvalResult, rankingResults };
}
