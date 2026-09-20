import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { postSystemModel, putSystemModel } from '@/web/core/ai/config';
import { UpdateSystemModelBodySchema } from '@fastgpt/global/openapi/admin/system/model/api';
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

/** 新建模型只调用创建接口，入参类型从结构上排除 modelId。 */
export const submitCreatedSystemModel = ({
  modelData
}: {
  modelData: SystemModelDocumentDataType;
  channelIds?: number[];
}) => postSystemModel({ modelData: normalizeModelPricingForSave(modelData) });

/** 编辑参数只按 modelId 更新已有模型的可编辑配置。 */
export const submitUpdatedSystemModel = async ({
  modelId,
  modelData
}: {
  modelId: SystemModelDataType['modelId'];
  modelData: SystemModelDocumentDataType;
  channelIds?: number[];
}) => {
  const normalizedModelData = normalizeModelPricingForSave(modelData);

  const input = UpdateSystemModelBodySchema.parse({
    modelData: {
      ...normalizedModelData,
      model: normalizedModelData.model.trim()
    }
  });
  await putSystemModel(input);
};
