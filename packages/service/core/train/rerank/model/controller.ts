import { MongoSystemModel } from '../../../ai/config/schema';
import { updatedReloadSystemModel } from '../../../ai/config/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getModelProvider } from '../../../app/provider/controller';
import {
  deleteTunedModelChannel,
  createTunedModelChannel,
  waitForChannelAvailable
} from '../task/helpers/channel';

/**
 * Create rerank model configuration (idempotent)
 *
 * Architecture: Model config contains metadata only, channel contains access credentials.
 * Order: 1) Create model config, 2) Create channel, 3) Poll until channel is available.
 *
 * @param params.name - Display name for the tuned model
 * @param params.endpoint - Tuned model endpoint (stored in channel, not model config)
 * @param params.isActive - Whether to activate the model immediately
 * @param params.charsPointsPrice - Inherited from base model
 * @returns Model configuration object ID
 */
export async function createRerankModelConfig(params: {
  name: string;
  endpoint: {
    base_url: string;
    api_key: string;
    model: string;
  };
  isActive: boolean;
  charsPointsPrice?: number;
  instruction?: string;
}): Promise<string> {
  const { name, endpoint, isActive, charsPointsPrice, instruction } = params;
  const model = endpoint.model;
  const channelName = `${model}-ch`;

  const modelConfig: RerankModelItemType = {
    provider: getModelProvider('Sangfor AICP').id,
    model,
    name,
    isActive: isActive ?? true,
    isCustom: true,
    isTuned: true,
    type: ModelTypeEnum.rerank,
    charsPointsPrice: charsPointsPrice ?? 0,
    instruction
  };

  const result = await MongoSystemModel.findOneAndUpdate(
    { model },
    {
      model,
      metadata: modelConfig
    },
    {
      upsert: true,
      new: true
    }
  );

  if (!result) {
    throw new Error('Failed to create or update model config');
  }

  const objectId = String(result._id);

  addLog.info('Created or updated rerank model config', {
    model,
    name,
    objectId,
    isActive
  });

  // Step 2: Create or update AI Proxy channel (idempotent)
  // Channel stores access credentials (base_url and api_key)
  await createTunedModelChannel({
    channelName,
    endpoint,
    modelConfigId: model
  });

  // Reload system models
  await updatedReloadSystemModel();
  addLog.info('Reloaded system models', { model, objectId });

  // Step 3: Poll until AI Proxy channel is available
  // New channels may not be immediately accessible after creation
  await waitForChannelAvailable({ model, endpoint });

  return objectId;
}

/**
 * Delete rerank model configuration
 *
 * Deletes model from AI Proxy channel and FastGPT system.
 * SFT Bridge resource cleanup is handled separately by deleteRerankTrainTask.
 * Order: 1) Delete channel first, 2) Delete model config + reload.
 *
 * @param modelConfigId - Model configuration ID (same as endpoint.model)
 * @returns Promise that resolves when deletion is complete
 * @throws {Error} When channel or model deletion fails
 */
export async function deleteRerankModelConfig(modelConfigId: string): Promise<void> {
  addLog.info('Deleting rerank model config', { modelConfigId });

  // Step 1: Delete AI Proxy channel first (contains access credentials)
  await deleteTunedModelChannel(modelConfigId);
  addLog.info('Deleted AI Proxy channel', { modelConfigId });

  // Step 2: Delete model configuration from FastGPT database
  const deleteResult = await MongoSystemModel.deleteOne({ model: modelConfigId });

  if (deleteResult.deletedCount === 0) {
    addLog.warn('No model config found to delete in FastGPT', { modelConfigId });
  } else {
    addLog.info('Deleted rerank model config from FastGPT', {
      modelConfigId,
      deletedCount: deleteResult.deletedCount
    });

    // Reload system models after deletion
    await updatedReloadSystemModel();
    addLog.info('Reloaded system models', { modelConfigId });
  }
}
