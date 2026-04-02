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
import { MongoApp } from '../../../app/schema';
import { MongoAppVersion } from '../../../app/version/schema';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { beforeUpdateAppFormat } from '../../../app/controller';
import { mongoSessionRun } from '../../../../common/mongo/sessionRun';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io';

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
 * Enable a rerank model by setting metadata.isActive = true
 */
export async function enableRerankModel(modelId: string): Promise<void> {
  await MongoSystemModel.updateOne({ model: modelId }, { $set: { 'metadata.isActive': true } });
  await updatedReloadSystemModel();
  addLog.info('Enabled rerank model', { modelId });
}

/**
 * Disable a rerank model by setting metadata.isActive = false
 */
export async function disableRerankModel(modelId: string): Promise<void> {
  await MongoSystemModel.updateOne({ model: modelId }, { $set: { 'metadata.isActive': false } });
  await updatedReloadSystemModel();
  addLog.info('Disabled rerank model', { modelId });
}

/**
 * Replace rerank model references in all Apps of a team.
 * Finds all apps with datasetSearchNode that reference oldModelId and replaces with newModelId.
 * Uses mongoSessionRun (transaction) per app, updates pluginData.nodeVersion.
 *
 * @param oldModelId - The model ID to replace
 * @param newModelId - The model ID to replace with
 * @param teamId - Team scope
 * @param tmbId - Team member ID (used for version creation)
 * @param versionNamePrefix - Prefix for the created app version name
 * @returns Number of apps updated
 */
export async function replaceRerankModelInApps(
  oldModelId: string,
  newModelId: string,
  teamId: string,
  tmbId: string,
  versionNamePrefix = 'Apply rerank model'
): Promise<number> {
  const apps = await MongoApp.find({ teamId }).lean();
  let updatedCount = 0;

  for (const app of apps) {
    try {
      const nodes = (app.modules || []) as StoreNodeItemType[];
      let hasMatch = false;

      const updatedNodes = nodes.map((node: StoreNodeItemType) => {
        if (node.flowNodeType !== FlowNodeTypeEnum.datasetSearchNode) return node;
        const updatedInputs = (node.inputs || []).map((input: FlowNodeInputItemType) => {
          if (
            input.key === NodeInputKeyEnum.datasetSearchRerankModel &&
            input.value === oldModelId
          ) {
            hasMatch = true;
            addLog.info('Replacing rerank model reference in app', {
              appId: String(app._id),
              nodeId: node.nodeId,
              oldModelId,
              newModelId
            });
            return { ...input, value: newModelId };
          }
          return input;
        });
        return { ...node, inputs: updatedInputs };
      });

      if (!hasMatch) continue;

      beforeUpdateAppFormat({ nodes: updatedNodes });

      await mongoSessionRun(async (session) => {
        const [{ _id: versionId }] = await MongoAppVersion.create(
          [
            {
              appId: app._id,
              tmbId,
              nodes: updatedNodes,
              edges: app.edges || [],
              chatConfig: app.chatConfig,
              isPublish: true,
              versionName: `${versionNamePrefix}: ${newModelId}`
            }
          ],
          { session, ordered: true }
        );

        await MongoApp.updateOne(
          { _id: app._id },
          {
            modules: updatedNodes,
            updateTime: new Date(),
            'pluginData.nodeVersion': versionId
          },
          { session }
        );
      });

      updatedCount++;
    } catch (err) {
      addLog.error('Failed to replace rerank model in app', {
        appId: String(app._id),
        error: err instanceof Error ? err.message : String(err)
      });
    }
  }

  addLog.info('Replaced rerank model references in apps', { oldModelId, newModelId, updatedCount });
  return updatedCount;
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
