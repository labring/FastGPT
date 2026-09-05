import type {
  SystemModelDataType,
  SystemModelDocumentDataType
} from '@fastgpt/global/core/ai/model.schema';
import { postSystemModel, putSystemModel } from '@/web/core/ai/config';
import { UpdateSystemModelBodySchema } from '@fastgpt/global/openapi/admin/core/ai/model/api';

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

/** 编辑参数与渠道作为同一次请求预检，服务端统一编排外部绑定和模型写入。 */
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

  const input = UpdateSystemModelBodySchema.parse({
    modelId,
    modelData: editableModelData,
    channelIds
  });
  await putSystemModel(input);
};
