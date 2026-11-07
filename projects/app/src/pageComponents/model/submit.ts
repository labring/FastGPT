import type {
  AIModelDataType,
  AIModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { resolveChannelType } from '@fastgpt/global/core/ai/model/utils';
import { postCreateModel, putUpdateModel } from '@/web/core/ai/model/api';
import { UpdateModelBodySchema } from '@fastgpt/global/openapi/core/ai/model/api';
import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

/** 保留完整未保存草稿，仅规范测试接口要求的模型标识和回退别名。 */
export const prepareDraftModelForTest = (
  modelData: AIModelDocumentDataType
): AIModelDocumentDataType => {
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

/** 转发已规范化的表单数据创建模型，关联渠道由服务端处理。 */
export const submitCreatedModel = async ({
  modelData,
  channelType,
  channelIds
}: {
  modelData: AIModelDocumentDataType;
  channelType?: ChannelType;
  channelIds?: number[];
}) => {
  const resolvedChannelType = resolveChannelType({ channelType, scope: modelData.scope });
  return postCreateModel({
    modelData,
    channelType: resolvedChannelType,
    channelIds: channelIds && channelIds.length > 0 ? channelIds : undefined
  });
};

/** 转发已规范化的表单数据，只按 modelId 更新已有模型的可编辑配置。 */
export const submitUpdatedModel = async ({
  modelId,
  modelData,
  channelType
}: {
  modelId: AIModelDataType['modelId'];
  modelData: AIModelDocumentDataType;
  channelType?: ChannelType;
}) => {
  const resolvedChannelType = resolveChannelType({ channelType, scope: modelData.scope });
  const input = UpdateModelBodySchema.parse({
    modelId,
    modelData: {
      ...modelData,
      model: modelData.model.trim()
    },
    channelType: resolvedChannelType
  });
  await putUpdateModel({ ...input, channelType: resolvedChannelType });
};
