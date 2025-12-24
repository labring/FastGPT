import { UnrecoverableError } from 'bullmq';
import type { RerankTrainTaskSchemaType } from '@fastgpt/global/core/train/rerank/type';
import { createRerankModelConfig } from '../../model/controller';
import { createTunedModelChannel } from '../helpers/channel';
import { addLog } from '../../../../../common/system/log';

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
    throw new UnrecoverableError('Tuned model endpoint not found in checkpoint');
  }

  if (!task.baseModelConfigId) {
    throw new UnrecoverableError('Base model config ID not found in task');
  }

  const tunedEndpoint = checkpointData.finetuning.tunedModelEndpoint;
  const baseModelConfigId = task.baseModelConfigId;
  const tunedModelConfigId = tunedEndpoint.model;

  // The model ID from SFT Bridge is already unique and identifies the finetuned model
  const tunedModelName = tunedModelConfigId;
  const tunedModelChannelName = `${tunedModelConfigId}-ch`;

  const tunedModelObjectId = await createRerankModelConfig({
    name: tunedModelName,
    endpoint: {
      model: tunedModelConfigId
    },
    isActive: true,
    charsPointsPrice: 0
  });

  await createTunedModelChannel({
    channelName: tunedModelChannelName,
    endpoint: tunedEndpoint,
    modelConfigId: tunedModelConfigId
  });

  addLog.info('Created tuned model channel and config', {
    taskId: String(task._id),
    modelConfigId: tunedModelConfigId,
    ModelObjectId: tunedModelObjectId,
    endpoint: tunedEndpoint
  });

  addLog.info('Register stage completed', {
    taskId: String(task._id),
    baseModelConfigId,
    tunedModelConfigId
  });

  return {
    tunedModelConfigId
  };
}
