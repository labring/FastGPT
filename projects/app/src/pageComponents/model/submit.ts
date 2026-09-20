import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { postCreateModel, putUpdateModel } from '@/web/core/ai/model/api';
import { UpdateModelBodySchema } from '@fastgpt/global/openapi/core/ai/model/api';
import { normalizeModelPricingForSave } from '@fastgpt/global/core/ai/model/pricing';

/** 保留完整未保存草稿，仅规范测试接口要求的模型标识和回退别名。 */
export const prepareDraftSystemModelForTest = (
  modelData: SystemModelDocumentDataType
): SystemModelDocumentDataType => {
  const model = modelData.model.trim();
  const draft = { ...modelData, model, name: modelData.name?.trim() || model };
  if (draft.type === ModelTypeEnum.llm) {
    draft.config = {
      ...draft.config,
      quoteMaxToken:
        draft.config.quoteMaxToken == null || Number.isNaN(draft.config.quoteMaxToken)
          ? Math.floor(draft.config.maxContext * 0.8)
          : draft.config.quoteMaxToken
    };
  }
  return draft;
};

/** 新建模型只调用创建接口，若指定了关联渠道，由服务端直接处理。 */
export const submitCreatedSystemModel = async ({
  modelData,
  channelType,
  channelIds
}: {
  modelData: SystemModelDocumentDataType;
  channelType?: 'system' | 'team';
  channelIds?: number[];
}) => {
  const resolvedChannelType =
    channelType ?? (modelData.scope === ModelScopeEnum.team ? 'team' : 'system');
  return postCreateModel({
    modelData: normalizeModelPricingForSave(modelData),
    channelType: resolvedChannelType,
    channelIds: channelIds && channelIds.length > 0 ? channelIds : undefined
  });
};

/** 编辑参数只按 modelId 更新已有模型的可编辑配置。 */
export const submitUpdatedSystemModel = async ({
  modelId,
  modelData,
  channelType
}: {
  modelId: SystemModelDataType['modelId'];
  modelData: SystemModelDocumentDataType;
  channelType?: 'system' | 'team';
}) => {
  const normalizedModelData = normalizeModelPricingForSave(modelData);

  const resolvedChannelType =
    channelType ?? (modelData.scope === ModelScopeEnum.team ? 'team' : 'system');
  const input = UpdateModelBodySchema.parse({
    modelId,
    modelData: {
      ...normalizedModelData,
      model: normalizedModelData.model.trim()
    },
    channelType: resolvedChannelType
  });
  await putUpdateModel({ ...input, channelType: resolvedChannelType });
};
