import type {
  RerankTrainTaskSchemaType,
  RerankEvalResult
} from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createRerankEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError } from '../../../common/errors';
import { evaluateRerankModelHelper } from '../helpers/evaluate-model';

/**
 * Stage 3: Evaluate Base Model
 *
 * Evaluates the base model on the eval dataset generated in stage 2,
 * establishing a performance baseline for comparison after fine-tuning.
 *
 * @param task - Training task data
 * @returns Base model evaluation result
 */
export async function runEvalBaseModelStage(task: RerankTrainTaskSchemaType): Promise<{
  baseModelEvalResult: RerankEvalResult;
}> {
  addLog.info('Run eval base model stage', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.eval_basemodel,
      RerankTrainErrEnum.rerankEvalDatasetEmptyBeforeEval,
      RerankTrainSuggestionEnum.rerankEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const baseModelEvalResult = await evaluateRerankModelHelper(
    String(task._id),
    evalDatasetId,
    task.baseModelId,
    RerankTaskCheckpointStageEnum.eval_basemodel
  );

  return { baseModelEvalResult };
}
