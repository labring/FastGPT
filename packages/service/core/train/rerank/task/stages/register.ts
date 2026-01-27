import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { RerankTaskCheckpointStageEnum } from '@fastgpt/global/core/train/rerank/constants';
import { createRerankModelConfig } from '../../model/controller';
import { addLog } from '../../../../../common/system/log';
import { createEnhancedError } from '../../utils';
import {
  RerankTrainErrEnum,
  RerankTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError } from '../errors';

/**
 * Stage 3: Model Registration
 *
 * Registers the finetuned rerank model configuration in FastGPT model management system.
 *
 * @param task - Training task data
 * @returns Tuned model config ID
 * @throws {UnrecoverableError} When tuned endpoint or base model config not found
 */
export async function runRegisterStage(task: RerankTrainTaskSchemaType): Promise<{
  tunedModelConfigId: string;
}> {
  addLog.info('Run register stage', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.finetuning?.tunedModelEndpoint) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.registering,
      RerankTrainErrEnum.registerEndpointNotFound,
      RerankTrainSuggestionEnum.registerEndpointNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  if (!task.baseModelConfigId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.registering,
      RerankTrainErrEnum.registerBaseModelNotFound,
      RerankTrainSuggestionEnum.registerBaseModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelConfigId = task.baseModelConfigId;
  const tunedModelConfigId = tunedEndpoint.model;

  // The model ID from SFT Bridge is already unique and identifies the finetuned model
  const tunedModelName = tunedModelConfigId;

  try {
    const tunedModelObjectId = await createRerankModelConfig({
      name: tunedModelName,
      endpoint: tunedEndpoint,
      isActive: true,
      charsPointsPrice: 0
    });

    addLog.info('Created tuned model config and channel', {
      taskId: String(task._id),
      modelConfigId: tunedModelConfigId,
      ModelObjectId: tunedModelObjectId,
      endpoint: tunedEndpoint
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.registering,
      RerankTrainErrEnum.registerAiProxyFailed,
      RerankTrainSuggestionEnum.registerAiProxyFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Register stage completed', {
    taskId: String(task._id),
    baseModelConfigId,
    tunedModelConfigId
  });

  return {
    tunedModelConfigId
  };
}
