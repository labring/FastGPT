import { MongoSystemModel } from '../../../ai/config/schema';
import { updatedReloadSystemModel } from '../../../ai/config/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getModelProvider } from '../../../app/provider/controller';
import {
  deleteTunedModelChannel,
  createTunedModelChannel,
  waitForChannelAvailable
} from '../task/helpers/channel';

/**
 * Create embedding model configuration (idempotent)
 *
 * Integrates with FastGPT model management system to create model configuration and AI Proxy channel.
 * Architecture: Model config contains metadata only, channel contains access credentials.
 * Order: 1) Create model config first, 2) Create channel second, 3) Poll until channel is available.
 *
 * Key difference from rerank: No replaceModelInApps function (embedding models don't need to be
 * replicated across apps in the same way as rerank models).
 *
 * @param params - Model configuration parameters
 * @param params.name - Model alias name
 * @param params.endpoint - Model endpoint configuration
 * @param params.endpoint.base_url - OpenAI API base URL (stored in channel only)
 * @param params.endpoint.api_key - API key (stored in channel only)
 * @param params.endpoint.model - Model name
 * @param params.isActive - Whether to activate the model
 * @param params.charsPointsPrice - Character points price
 * @returns Model configuration object ID
 * @throws {Error} When model config or channel creation fails, or channel does not become available within timeout
 */
export async function createEmbeddingModelConfig(params: {
  name: string;
  endpoint: {
    base_url: string;
    api_key: string;
    model: string;
  };
  isActive: boolean;
  charsPointsPrice: number;
}): Promise<string> {
  const { name, endpoint, isActive, charsPointsPrice } = params;
  const model = endpoint.model;
  const channelName = `${model}-ch`;

  // Step 1: Create or update model configuration in database (idempotent with upsert)
  // Model config contains metadata only, no credentials
  const modelConfig: EmbeddingModelItemType = {
    provider: getModelProvider('Sangfor AICP').id,
    model,
    name,
    isActive: isActive ?? true,
    isCustom: true,
    isTuned: true, // Mark as fine-tuned model created by training module
    // Do NOT store requestUrl and requestAuth - these are in the channel
    type: ModelTypeEnum.embedding,
    charsPointsPrice
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

  addLog.info('Created or updated embedding model config', {
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
 * Delete embedding model configuration
 *
 * Deletes model from AI Proxy channel and FastGPT system.
 * SFT Bridge resource cleanup is handled separately by deleteEmbeddingTrainTask.
 * Order: 1) Delete channel first, 2) Delete model config + reload.
 *
 * @param modelConfigId - Model configuration ID (same as endpoint.model)
 * @returns Promise that resolves when deletion is complete
 * @throws {Error} When channel or model deletion fails
 */
export async function deleteEmbeddingModelConfig(modelConfigId: string): Promise<void> {
  addLog.info('Deleting embedding model config', { modelConfigId });

  // Step 1: Delete AI Proxy channel first (contains access credentials)
  await deleteTunedModelChannel(modelConfigId);
  addLog.info('Deleted AI Proxy channel', { modelConfigId });

  // Step 2: Delete model configuration from FastGPT database
  const deleteResult = await MongoSystemModel.deleteOne({ model: modelConfigId });

  if (deleteResult.deletedCount === 0) {
    addLog.warn('No model config found to delete in FastGPT', { modelConfigId });
  } else {
    addLog.info('Deleted embedding model config from FastGPT', {
      modelConfigId,
      deletedCount: deleteResult.deletedCount
    });

    // Reload system models after deletion
    await updatedReloadSystemModel();
    addLog.info('Reloaded system models', { modelConfigId });
  }
}
