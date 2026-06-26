import { MongoSystemModel } from '../../../ai/config/schema';
import { updatedReloadSystemModel } from '../../../ai/config/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { EmbeddingModelItemType } from '@fastgpt/global/core/ai/model.schema';
import { getModelProvider } from '../../../app/provider/controller';
import {
  deleteTunedModelChannel,
  createTunedModelChannel,
  waitForChannelAvailable
} from '../task/helpers/channel';
import { MongoEmbeddingTrainTask } from '../task/schema';

/**
 * Create embedding model configuration
 *
 * Architecture: Model config contains metadata only, channel contains access credentials.
 * Order: 1) Create model config, 2) Create channel, 3) Poll until channel is available.
 *
 * @param params.name - Display name for the tuned model
 * @param params.endpoint - Tuned model endpoint (stored in channel, not model config)
 * @param params.isActive - Whether to activate the model immediately
 * @param params.charsPointsPrice - Inherited from base model
 * @param params.defaultToken - Inherited from base model (split text default token)
 * @param params.maxToken - Inherited from base model (model max token)
 * @param params.weight - Inherited from base model (training weight)
 * @param params.normalization - Inherited from base model
 * @param params.batchSize - Inherited from base model
 * @param params.defaultConfig - Inherited from base model (post request config)
 * @returns Model configuration object ID
 */
export async function createEmbeddingModelConfig(params: {
  name: string;
  endpoint: {
    base_url: string;
    api_key: string;
    model: string;
  };
  isActive: boolean;
  tmbId: string;
  teamId: string;
  charsPointsPrice?: number;
  defaultToken?: number;
  maxToken?: number;
  weight?: number;
  normalization?: boolean;
  batchSize?: number;
  defaultConfig?: Record<string, any>;
  instruction?: string;
  taskId: string;
}): Promise<string> {
  const { name, endpoint, isActive, tmbId, teamId } = params;
  const model = endpoint.model;
  const channelName = `${model}-ch`;

  const modelConfig: EmbeddingModelItemType = {
    id: '',
    provider: getModelProvider('Sangfor AICP').id,
    model,
    name,
    isActive: isActive ?? true,
    isCustom: true,
    isTuned: true,
    type: ModelTypeEnum.embedding,
    charsPointsPrice: params.charsPointsPrice ?? 0,
    defaultToken: params.defaultToken ?? 512,
    maxToken: params.maxToken ?? 512,
    weight: params.weight ?? 0,
    normalization: params.normalization,
    batchSize: params.batchSize ?? 10,
    defaultConfig: params.defaultConfig,
    instruction: params.instruction
  };

  const task = await MongoEmbeddingTrainTask.findById(
    params.taskId,
    'checkpoint.data.registering.tunedModelId'
  ).lean();
  const existingModelId = task?.checkpoint?.data?.registering?.tunedModelId;

  const { id: _, ...configFields } = modelConfig;

  const result = existingModelId
    ? await MongoSystemModel.findOneAndUpdate(
        { _id: existingModelId },
        {
          ...configFields,
          tmbId,
          teamId,
          isShared: false
        },
        {
          new: true
        }
      )
    : await MongoSystemModel.create({
        ...configFields,
        tmbId,
        teamId,
        isShared: false
      });

  if (!result) {
    throw new Error('Failed to create or update model config');
  }

  const objectId = String(result._id);

  if (!existingModelId) {
    await MongoEmbeddingTrainTask.updateOne(
      { _id: params.taskId },
      {
        'checkpoint.data.registering.tunedModelId': objectId,
        updateTime: new Date()
      }
    );
  }

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
 * @param modelId - Model's MongoDB _id (platform-unique model ID)
 * @returns Promise that resolves when deletion is complete
 * @throws {Error} When channel or model deletion fails
 */
export async function deleteEmbeddingModelConfig(modelId: string): Promise<void> {
  addLog.info('Deleting embedding model config', { modelId });

  // Look up the model config to get the model name (needed for channel operations)
  const doc = await MongoSystemModel.findById(modelId).lean();
  if (!doc) {
    addLog.warn('No model config found to delete in FastGPT', { modelId });
    return;
  }
  const modelName = doc.model;

  // Step 1: Delete AI Proxy channel first (contains access credentials)
  await deleteTunedModelChannel(modelName);
  addLog.info('Deleted AI Proxy channel', { modelId, modelName });

  // Step 2: Delete model configuration from FastGPT database
  const deleteResult = await MongoSystemModel.deleteOne({ _id: modelId });

  if (deleteResult.deletedCount === 0) {
    addLog.warn('No model config found to delete in FastGPT', { modelId });
  } else {
    addLog.info('Deleted embedding model config from FastGPT', {
      modelId,
      modelName,
      deletedCount: deleteResult.deletedCount
    });

    // Reload system models after deletion
    await updatedReloadSystemModel();
    addLog.info('Reloaded system models', { modelId });
  }
}
