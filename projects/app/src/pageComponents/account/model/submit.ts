import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import {
  postSystemModel,
  putReplaceSystemModelChannels,
  putSystemModel
} from '@/web/core/ai/config';

/** 保留完整未保存草稿，仅规范测试接口要求的模型标识和回退别名。 */
export const prepareDraftSystemModelForTest = (
  modelData: SystemModelDocumentDataType
): SystemModelDocumentDataType => {
  const model = modelData.model.trim();
  return {
    ...modelData,
    model,
    name: modelData.name || model
  };
};

/** 新建模型只调用创建接口，入参类型从结构上排除 modelId。 */
export const submitCreatedSystemModel = ({
  modelData,
  channelIds
}: {
  modelData: SystemModelDocumentDataType;
  channelIds: number[];
}) => postSystemModel({ modelData, channelIds });

/** 编辑模型先替换渠道关联，再移除不可变模型标识并按稳定 modelId 更新参数。 */
export const submitUpdatedSystemModel = async ({
  modelId,
  modelData,
  channelIds
}: {
  modelId: SystemModelDataType['modelId'];
  modelData: SystemModelDocumentDataType;
  channelIds: number[];
}) => {
  const { model: _model, ...editableModelData } = modelData;

  await putReplaceSystemModelChannels({
    modelId,
    channelIds
  });
  await putSystemModel({ modelId, modelData: editableModelData });
};
