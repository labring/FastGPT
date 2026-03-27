import type {
  RerankTrainTaskSchemaType,
  RerankEvalResult
} from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { addLog } from '../../../../../common/system/log';
import { TrainTaskUnrecoverableError } from '../errors';
import { evaluateModel } from '../helpers/evaluate-model';

/**
 * Stage 6: Evaluate Tuned Model
 *
 * Evaluates the fine-tuned model on the same eval dataset used for the base model,
 * to compare performance and decide whether to keep the new model.
 *
 * @param task - Training task data
 * @returns Tuned model evaluation result
 */
export async function runEvalTunedModelStage(task: RerankTrainTaskSchemaType): Promise<{
  tunedModelEvalResult: RerankEvalResult;
}> {
  addLog.info('Run eval tuned model stage', { taskId: String(task._id) });

  const evalDatasetId = task.checkpoint.data?.generate_evaldataset?.evalDatasetId;
  if (!evalDatasetId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.eval_tunedmodel,
      RerankTrainErrEnum.evalDatasetEmptyBeforeEval,
      RerankTrainSuggestionEnum.evalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelId = task.checkpoint.data?.registering?.tunedModelId;
  if (!tunedModelId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.eval_tunedmodel,
      RerankTrainErrEnum.evalModelNotFound,
      RerankTrainSuggestionEnum.evalModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelEvalResult = await evaluateModel(
    String(task._id),
    evalDatasetId,
    tunedModelId,
    RerankTaskCheckpointStageEnum.eval_tunedmodel
  );

  return { tunedModelEvalResult };
}
