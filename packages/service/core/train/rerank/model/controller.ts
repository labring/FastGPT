import { MongoSystemModel } from '../../../ai/config/schema';
import { updatedReloadSystemModel } from '../../../ai/config/utils';
import { addLog } from '../../../../common/system/log';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/model';
import type { RerankModelItemType } from '@fastgpt/global/core/ai/model.d';
import { getModelProvider } from '@fastgpt/global/core/ai/provider';

/**
 * Create rerank model configuration
 *
 * Integrates with FastGPT model management system to create real model configuration.
 *
 * @param params - Model configuration parameters
 * @param params.name - Model alias name
 * @param params.endpoint - Model endpoint configuration
 * @param params.endpoint.base_url - Optional OpenAI API base URL
 * @param params.endpoint.api_key - Optional API key
 * @param params.endpoint.model - Model name
 * @param params.isActive - Whether to activate the model
 * @param params.charsPointsPrice - Character points price
 * @returns Model configuration object ID
 * @throws {Error} When model creation or update fails
 */
export async function createRerankModelConfig(params: {
  name: string;
  endpoint: {
    base_url?: string;
    api_key?: string;
    model: string;
  };
  isActive: boolean;
  charsPointsPrice: number;
}): Promise<string> {
  const { name, endpoint, isActive, charsPointsPrice } = params;
  const model = endpoint.model;

  const modelConfig: RerankModelItemType = {
    provider: getModelProvider('OpenAI').id, // TODO: Replace by Sangfor AICP in future
    model,
    name,
    isActive: isActive ?? true,
    isCustom: true,
    requestUrl: endpoint.base_url,
    requestAuth: endpoint.api_key,
    type: ModelTypeEnum.rerank,
    charsPointsPrice
  };

  try {
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

    addLog.info('Created or updated rerank model config in database', {
      model,
      name,
      objectId,
      requestUrl: endpoint.base_url,
      isActive
    });

    await updatedReloadSystemModel();

    addLog.info('Reloaded system models after creating rerank model', {
      model,
      objectId
    });

    return objectId;
  } catch (error) {
    addLog.error('Failed to create rerank model config', {
      model,
      name,
      error: error instanceof Error ? error.message : String(error)
    });

    throw new Error(
      `Failed to create rerank model config: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
