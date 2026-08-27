import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  UpdateDefaultModelsBodySchema,
  type UpdateDefaultModelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';

/**
 * 更新系统默认模型。所有非空引用会在清除旧默认值前一次性校验，避免错误 ID、禁用模型、
 * 类型不匹配或不支持视觉的模型让默认配置进入部分更新状态。
 */
async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  await authSystemAdmin({ req });
  const defaults = parseApiInput({ req, bodySchema: UpdateDefaultModelsBodySchema }).body;
  const defaultFields = [
    {
      modelId: defaults[ModelTypeEnum.llm],
      field: 'isDefault',
      expectedType: ModelTypeEnum.llm
    },
    {
      modelId: defaults[ModelTypeEnum.embedding],
      field: 'isDefault',
      expectedType: ModelTypeEnum.embedding
    },
    {
      modelId: defaults[ModelTypeEnum.tts],
      field: 'isDefault',
      expectedType: ModelTypeEnum.tts
    },
    {
      modelId: defaults[ModelTypeEnum.stt],
      field: 'isDefault',
      expectedType: ModelTypeEnum.stt
    },
    {
      modelId: defaults[ModelTypeEnum.rerank],
      field: 'isDefault',
      expectedType: ModelTypeEnum.rerank
    },
    {
      modelId: defaults.datasetTextLLMModelId,
      field: 'isDefaultDatasetTextModel',
      expectedType: ModelTypeEnum.llm
    },
    {
      modelId: defaults.datasetImageLLMModelId,
      field: 'isDefaultDatasetImageModel',
      expectedType: ModelTypeEnum.llm,
      requiresVision: true
    },
    {
      modelId: defaults.chatTitleLLMModelId,
      field: 'isDefaultChatTitleModel',
      expectedType: ModelTypeEnum.llm
    }
  ].filter((item): item is typeof item & { modelId: string } => typeof item.modelId === 'string');

  if (defaultFields.length > 0) {
    // 全表读取后按 String(_id) 精确匹配，避免把 API 的 string modelId 提前限制为 ObjectId。
    const modelMap = new Map(
      (
        await MongoAIModel.find(
          { scope: ModelScopeEnum.system },
          '_id type isActive config.vision'
        ).lean()
      ).map((model) => [String(model._id), model])
    );

    for (const { modelId, expectedType, requiresVision } of defaultFields) {
      const model = modelMap.get(modelId);
      if (
        !model ||
        !model.isActive ||
        model.type !== expectedType ||
        (requiresVision && !('vision' in model.config && model.config.vision))
      ) {
        throw new UserError(ModelErrEnum.unExist);
      }
    }
  }

  // 插件不可用时不提交数据库更新，保持数据库与当前运行时默认模型一致。
  const pluginDocuments = await refreshModelTemplates();

  await mongoSessionRun(async (session) => {
    await MongoAIModel.updateMany(
      { scope: ModelScopeEnum.system },
      {
        $unset: {
          isDefault: '',
          isDefaultDatasetTextModel: '',
          isDefaultDatasetImageModel: '',
          isDefaultChatTitleModel: ''
        }
      },
      { session }
    );
    if (defaultFields.length === 0) return;

    await MongoAIModel.bulkWrite(
      defaultFields.map(({ modelId, field }) => ({
        updateOne: {
          filter: { _id: modelId, scope: ModelScopeEnum.system },
          update: { $set: { [field]: true } }
        }
      })),
      { session }
    );
  });

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
