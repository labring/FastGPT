import type { EmbeddingTrainTaskSchemaType } from '@fastgpt/global/core/train/embedding/type';
import {
  EmbeddingTaskCheckpointStageEnum,
  EmbeddingTrainMethodEnum
} from '@fastgpt/global/core/train/embedding/constants';
import { createEmbeddingModelConfig } from '../../model/controller';
import { addLog } from '../../../../../common/system/log';
import { createEmbeddingEnhancedError } from '../../utils';
import {
  EmbeddingTrainErrEnum,
  EmbeddingTrainSuggestionEnum
} from '@fastgpt/global/common/error/code/train';
import { TrainTaskUnrecoverableError } from '../../../common/errors';
import { getEmbeddingModelById } from '../../../../ai/model';

/**
 * Stage 5: Model Registration
 *
 * Registers the finetuned embedding model configuration in FastGPT model management system.
 *
 * @param task - Embedding training task data
 * @returns Tuned model ID
 * @throws {TrainTaskUnrecoverableError} When tuned endpoint or base model not found
 */
export async function runRegisterStage(task: EmbeddingTrainTaskSchemaType): Promise<{
  tunedModelId: string;
}> {
  addLog.info('Run register stage (embedding)', { taskId: String(task._id) });

  const checkpointData = task.checkpoint.data || {};
  if (!checkpointData.finetuning?.tunedModelEndpoint) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.registering,
      EmbeddingTrainErrEnum.embeddingRegisterEndpointNotFound,
      EmbeddingTrainSuggestionEnum.embeddingRegisterEndpointNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  if (!task.baseModelId) {
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.registering,
      EmbeddingTrainErrEnum.embeddingRegisterBaseModelNotFound,
      EmbeddingTrainSuggestionEnum.embeddingRegisterBaseModelNotFound
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelId = task.baseModelId;

  // Use task.newModelName if provided, otherwise fall back to the model ID from SFT Bridge
  const tunedModelName = task.newModelName || tunedEndpoint.model;

  // Inherit config from base model
  const baseModel = getEmbeddingModelById(baseModelId);

  let tunedModelId: string;
  try {
    tunedModelId = await createEmbeddingModelConfig({
      name: tunedModelName,
      endpoint: tunedEndpoint,
      isActive: true,
      tmbId: task.tmbId,
      teamId: task.teamId,
      charsPointsPrice: baseModel.charsPointsPrice,
      defaultToken: baseModel.defaultToken,
      maxToken: baseModel.maxToken,
      weight: baseModel.weight,
      normalization: baseModel.normalization,
      batchSize: baseModel.batchSize,
      defaultConfig: baseModel.defaultConfig,
      instruction:
        task.trainMethod === EmbeddingTrainMethodEnum.task_tuning
          ? undefined
          : baseModel.instruction,
      taskId: String(task._id)
    });

    addLog.info('Created tuned embedding model config and channel', {
      taskId: String(task._id),
      tunedModelId,
      tunedModelName,
      endpoint: tunedEndpoint
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Distinguish channel availability timeout from other errors
    const isChannelTimeout = errorMsg.includes('did not become available');
    const enhancedError = createEmbeddingEnhancedError(
      EmbeddingTaskCheckpointStageEnum.registering,
      isChannelTimeout
        ? EmbeddingTrainErrEnum.embeddingRegisterChannelNotAvailable
        : EmbeddingTrainErrEnum.embeddingRegisterAiProxyFailed,
      isChannelTimeout
        ? EmbeddingTrainSuggestionEnum.embeddingRegisterChannelNotAvailable
        : EmbeddingTrainSuggestionEnum.embeddingRegisterAiProxyFailed,
      errorMsg
    );
    throw new TrainTaskUnrecoverableError(enhancedError);
  }

  addLog.info('Register stage completed (embedding)', {
    taskId: String(task._id),
    baseModelId,
    tunedModelId,
    tunedModelName
  });

  return {
    tunedModelId
  };
}
