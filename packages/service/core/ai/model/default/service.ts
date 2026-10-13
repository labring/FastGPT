import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import type { ModelDefaultIds } from '@fastgpt/global/core/ai/model/default';
import { runModelTransaction } from '../catalog/transaction';
import { MongoAIModel } from '../schema';
import { assertModelAvailable } from '../../utils';
import { updatedReloadSystemModel } from '../catalog/service';
import { upsertSystemDefaultModelIds } from '../catalog/entity';

/** 校验默认模型引用并提交配置，不接受失效或类型不匹配的引用。 */
export const updateSystemDefaultModels = async (defaults: ModelDefaultIds): Promise<void> => {
  await runModelTransaction({ scope: ModelScopeEnum.system }, async (session) => {
    const defaultFields = [
      {
        modelId: defaults.llm,
        expectedType: ModelTypeEnum.llm
      },
      {
        modelId: defaults.embedding,
        expectedType: ModelTypeEnum.embedding
      },
      {
        modelId: defaults.tts,
        expectedType: ModelTypeEnum.tts
      },
      {
        modelId: defaults.stt,
        expectedType: ModelTypeEnum.stt
      },
      {
        modelId: defaults.rerank,
        expectedType: ModelTypeEnum.rerank
      },
      {
        modelId: defaults.datasetTextLLM,
        expectedType: ModelTypeEnum.llm
      },
      {
        modelId: defaults.datasetImageLLM,
        expectedType: ModelTypeEnum.llm,
        requiresVision: true
      },
      {
        modelId: defaults.chatTitleLLM,
        expectedType: ModelTypeEnum.llm
      }
    ].filter((item): item is typeof item & { modelId: string } => typeof item.modelId === 'string');

    if (defaultFields.length > 0) {
      const modelMap = new Map(
        (
          await MongoAIModel.find(
            { scope: ModelScopeEnum.system },
            '_id name model type isActive config.vision'
          )
            .session(session)
            .lean()
        ).map((model) => [String(model._id), model])
      );

      for (const { modelId, expectedType, requiresVision } of defaultFields) {
        assertModelAvailable({
          model: modelMap.get(modelId),
          type: expectedType,
          vision: requiresVision
        });
      }
    }

    await upsertSystemDefaultModelIds(defaults, session);
  });

  await updatedReloadSystemModel();
};
