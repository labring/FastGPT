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
 * Stage 5: Model Registration
 *
 * Registers the finetuned rerank model configuration in FastGPT model management system.
 *
 * @param task - Training task data
 * @returns Tuned model ID
 * @throws {UnrecoverableError} When tuned endpoint or base model not found
 */
export async function runRegisterStage(task: RerankTrainTaskSchemaType): Promise<{
  tunedModelId: string;
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

  if (!task.baseModelId) {
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.registering,
      RerankTrainErrEnum.registerBaseModelNotFound,
      RerankTrainSuggestionEnum.registerBaseModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelId = task.baseModelId;
  const tunedModelId = tunedEndpoint.model;

  // Use task.newModelName if provided, otherwise fall back to the model ID from SFT Bridge
  const tunedModelName = task.newModelName || tunedModelId;

  try {
    const tunedModelObjectId = await createRerankModelConfig({
      name: tunedModelName,
      endpoint: tunedEndpoint,
      isActive: true,
      charsPointsPrice: 0
    });

    addLog.info('Created tuned model config and channel', {
      taskId: String(task._id),
      tunedModelId,
      tunedModelObjectId,
      endpoint: tunedEndpoint
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Distinguish channel availability timeout from other errors
    const isChannelTimeout = errorMsg.includes('did not become available');
    const enhancedError = createEnhancedError(
      RerankTaskCheckpointStageEnum.registering,
      isChannelTimeout
        ? RerankTrainErrEnum.registerChannelNotAvailable
        : RerankTrainErrEnum.registerAiProxyFailed,
      isChannelTimeout
        ? RerankTrainSuggestionEnum.registerChannelNotAvailable
        : RerankTrainSuggestionEnum.registerAiProxyFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Register stage completed', {
    taskId: String(task._id),
    baseModelId,
    tunedModelId
  });

  return {
    tunedModelId
  };
}
