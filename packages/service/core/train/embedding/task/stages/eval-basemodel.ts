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
 * Stage 3: Evaluate Base Model
 *
 * Evaluates the base model on the eval dataset generated in stage 2,
 * establishing a performance baseline for comparison after fine-tuning.
 *
 * Key difference from rerank: uses evaluateEmbeddingModelHelper which
 * only uses expected_dataid, without retrieval_reference_list.
 *
 * @param task - Embedding training task data
 * @returns Base model evaluation result
 */
export async function runEvalBaseModelStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  baseModelEvalResult: EmbeddingEvalResult;
  rankingResults: Array<{ itemId: string; rankedIds: string[] }>;
}> {
  addLog.info('Run eval base model stage (embedding)', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.eval_basemodel,
      EmbeddingTrainErrEnum.embeddingEvalDatasetEmptyBeforeEval,
      EmbeddingTrainSuggestionEnum.embeddingEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const { evalResult: baseModelEvalResult, rankingResults } = await evaluateEmbeddingModelHelper(
    String(task._id),
    evalDatasetId,
    task.baseModelId,
    EmbeddingTaskCheckpointStageEnum.eval_basemodel,
    task.teamId,
    task.tmbId,
    task.datasetIds
  );

  return { baseModelEvalResult, rankingResults };
}
