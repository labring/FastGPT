import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
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
import { upsertSystemDefaultModelIds } from '@fastgpt/service/core/ai/defaultModel/entity';

/**
 * 更新系统默认模型。所有非空引用会在写入系统作用域配置前一次性校验，避免错误 ID、禁用模型、
 * 类型不匹配或不支持视觉的模型让默认配置进入部分更新状态。
 */
async function handler(req: ApiRequestProps<UpdateDefaultModelsBody>): Promise<void> {
  await authSystemAdmin({ req });
  const defaults = parseApiInput({ req, bodySchema: UpdateDefaultModelsBodySchema }).body;
  const defaultFields = [
    {
      modelId: defaults[ModelTypeEnum.llm],
      expectedType: ModelTypeEnum.llm
    },
    {
      modelId: defaults[ModelTypeEnum.embedding],
      expectedType: ModelTypeEnum.embedding
    },
    {
      modelId: defaults[ModelTypeEnum.tts],
      expectedType: ModelTypeEnum.tts
    },
    {
      modelId: defaults[ModelTypeEnum.stt],
      expectedType: ModelTypeEnum.stt
    },
    {
      modelId: defaults[ModelTypeEnum.rerank],
      expectedType: ModelTypeEnum.rerank
    },
    {
      modelId: defaults.datasetTextLLMModelId,
      expectedType: ModelTypeEnum.llm
    },
    {
      modelId: defaults.datasetImageLLMModelId,
      expectedType: ModelTypeEnum.llm,
      requiresVision: true
    },
    {
      modelId: defaults.chatTitleLLMModelId,
      expectedType: ModelTypeEnum.llm
    }
  ].filter((item): item is typeof item & { modelId: string } => typeof item.modelId === 'string');

  if (defaultFields.length > 0) {
    // 全表读取后按 String(_id) 精确匹配，统一处理 API 层已校验的 ObjectId 字符串。
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

  const configuredDefaultModelIds = {
    [ModelTypeEnum.llm]: defaults[ModelTypeEnum.llm],
    [ModelTypeEnum.embedding]: defaults[ModelTypeEnum.embedding],
    [ModelTypeEnum.tts]: defaults[ModelTypeEnum.tts],
    [ModelTypeEnum.stt]: defaults[ModelTypeEnum.stt],
    [ModelTypeEnum.rerank]: defaults[ModelTypeEnum.rerank],
    datasetTextLLM: defaults.datasetTextLLMModelId,
    datasetImageLLM: defaults.datasetImageLLMModelId,
    chatTitleLLM: defaults.chatTitleLLMModelId
  };

  await upsertSystemDefaultModelIds(configuredDefaultModelIds);

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
