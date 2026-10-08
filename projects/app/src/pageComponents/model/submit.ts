import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { resolveChannelType } from '@fastgpt/global/core/ai/model';
import { postCreateModel, putUpdateModel } from '@/web/core/ai/model/api';
import { UpdateModelBodySchema } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/openapi/core/ai/model/channel/api';
import { normalizeModelPricingForSave } from '@fastgpt/global/core/ai/model/pricing';

/** 保留完整未保存草稿，仅规范测试接口要求的模型标识和回退别名。 */
export const prepareDraftModelForTest = (
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
export const submitCreatedModel = async ({
  modelData,
  channelType,
  channelIds
}: {
  modelData: SystemModelDocumentDataType;
  channelType?: ChannelType;
  channelIds?: number[];
}) => {
  const resolvedChannelType = resolveChannelType({ channelType, scope: modelData.scope });
  return postCreateModel({
    modelData: normalizeModelPricingForSave(modelData),
    channelType: resolvedChannelType,
    channelIds: channelIds && channelIds.length > 0 ? channelIds : undefined
  });
};

/** 编辑参数只按 modelId 更新已有模型的可编辑配置。 */
export const submitUpdatedModel = async ({
  modelId,
  modelData,
  channelType
}: {
  modelId: SystemModelDataType['modelId'];
  modelData: SystemModelDocumentDataType;
  channelType?: ChannelType;
}) => {
  const normalizedModelData = normalizeModelPricingForSave(modelData);

  const resolvedChannelType = resolveChannelType({ channelType, scope: modelData.scope });
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
