import { MongoSystemModel } from '../../../ai/config/schema';
import { updatedReloadSystemModel } from '../../../ai/config/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getModelProvider } from '../../../app/provider/controller';
import { deleteSFTTask } from '../external';
import {
  deleteTunedModelChannel,
  createTunedModelChannel,
  waitForChannelAvailable
} from '../task/helpers/channel';

/**
 * Create rerank model configuration (idempotent)
 *
 * Integrates with FastGPT model management system to create model configuration and AI Proxy channel.
 * Architecture: Model config contains metadata only, channel contains access credentials.
 * Order: 1) Create model config first, 2) Create channel second, 3) Poll until channel is available.
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
export async function createRerankModelConfig(params: {
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
  const modelConfig: RerankModelItemType = {
    provider: getModelProvider('Sangfor AICP').id,
    model,
    name,
    isActive: isActive ?? true,
    isCustom: true,
    isTuned: true, // Mark as fine-tuned model created by training module
    // Do NOT store requestUrl and requestAuth - these are in the channel
    type: ModelTypeEnum.rerank,
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
 * Deletes model from AI Proxy channel, FastGPT system, and SFT Bridge platform.
 * Order: 1) Delete channel first, 2) Delete model config, 3) Delete from SFT Bridge.
 *
 * @param modelConfigId - Model configuration ID (same as endpoint.model)
 * @param sftTaskId - Optional SFT Bridge task ID for cleanup (if available)
 * @returns Promise that resolves when deletion is complete
 * @throws {Error} When channel or model deletion fails (SFT Bridge errors are non-blocking)
 */
export async function deleteRerankModelConfig(
  modelConfigId: string,
  sftTaskId?: string
): Promise<void> {
  addLog.info('Deleting rerank model config', { modelConfigId, sftTaskId });

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

  // Step 3: Delete from SFT Bridge platform (async, non-blocking)
  // Run in background to avoid blocking the main deletion flow (SFT task deletion can be slow)
  // Only attempt deletion if sftTaskId is provided
  if (sftTaskId) {
    // Use setImmediate to run async without awaiting
    setImmediate(() => {
      deleteSFTTask({ taskId: sftTaskId })
        .then((sftResult) => {
          addLog.info('Successfully deleted SFT task from SFT Bridge', {
            modelConfigId,
            sftTaskId,
            taskId: sftResult.task_id,
            message: sftResult.message
          });
        })
        .catch((sftError) => {
          addLog.warn('Error calling SFT Bridge delete task API', {
            modelConfigId,
            sftTaskId,
            error: sftError instanceof Error ? sftError.message : String(sftError)
          });
        });
    });
    addLog.info('Triggered async SFT task deletion', { modelConfigId, sftTaskId });
  } else {
    addLog.info('No sftTaskId provided, skipping SFT Bridge deletion', { modelConfigId });
  }
}
