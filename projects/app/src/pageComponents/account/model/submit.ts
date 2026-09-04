import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import {
  postSystemModel,
  putReplaceSystemModelChannels,
  putSystemModel
} from '@/web/core/ai/config';

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
