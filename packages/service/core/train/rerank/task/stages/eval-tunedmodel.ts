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
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.eval_tunedmodel,
      RerankTrainErrEnum.rerankEvalDatasetEmptyBeforeEval,
      RerankTrainSuggestionEnum.rerankEvalDatasetEmptyBeforeEval
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelId = task.checkpoint.data?.registering?.tunedModelId;
  if (!tunedModelId) {
    const enhancedError = createRerankEnhancedError(
      RerankTaskCheckpointStageEnum.eval_tunedmodel,
      RerankTrainErrEnum.rerankEvalModelNotFound,
      RerankTrainSuggestionEnum.rerankEvalModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedModelEvalResult = await evaluateRerankModelHelper(
    String(task._id),
    evalDatasetId,
    tunedModelId,
    RerankTaskCheckpointStageEnum.eval_tunedmodel
  );

  return { tunedModelEvalResult };
}
