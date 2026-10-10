import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  ModelReference,
  CreateModelBody,
  CreateModelResponse,
  CreateModelsFromTemplatesBody,
  CreateModelsFromTemplatesResponse,
  DeleteModelsBody,
  GetModelTemplatesResponse,
  GetModelDetailResponse,
  GetSystemModelConfigResponse,
  GetTeamModelsResponse,
  TestModelQuery,
  TestDraftModelBody,
  UpdateModelBody,
  UpdateModelChannelsBody,
  UpdateModelStatusBody,
  UpdateDefaultModelsBody,
  UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/core/ai/model/api';

import type { ChannelType } from '@fastgpt/global/core/ai/model/scope';

const coreModelPath = '/core/ai/model';

/* ═══ 1. 模型核心生命周期操作 (/core/ai/model/*) ═══ */

/** 获取模型管理配置（统一支持 system 与 team 作用域） */
export const getModelConfig = <
  T extends GetSystemModelConfigResponse | GetTeamModelsResponse =
    | GetSystemModelConfigResponse
    | GetTeamModelsResponse
>({
  channelType
}: {
  channelType: ChannelType;
}) => GET<T>(`${coreModelPath}/config`, { channelType });

/** 获取模型模板列表，强制显式传递 channelType（成员创建团队模型时也走模板入口） */
export const getModelTemplates = (data: { channelType: ChannelType }) =>
  GET<GetModelTemplatesResponse>(`${coreModelPath}/templates`, data);

/** 创建模型（系统模型或团队私有模型），强制显式传递 channelType */
export const postCreateModel = (data: CreateModelBody) =>
  POST<CreateModelResponse>(`${coreModelPath}/create`, data);

/** 从模板批量创建模型，强制显式传递 channelType */
export const postModelsFromTemplates = (data: CreateModelsFromTemplatesBody) =>
  POST<CreateModelsFromTemplatesResponse>(`${coreModelPath}/createFromTemplates`, data);

/** 获取模型详情（携带关联渠道状态），强制显式传递 channelType */
export const getModelDetail = (modelId: string, channelType: ChannelType) =>
  GET<GetModelDetailResponse>(`${coreModelPath}/detail`, {
    modelId,
    channelType
  });

/** 更新模型配置，强制显式传递 channelType */
export const putUpdateModel = (data: UpdateModelBody) => PUT(`${coreModelPath}/update`, data);

/** 追加或解除模型与渠道的关联，强制显式传递 channelType */
export const postUpdateModelChannels = (data: UpdateModelChannelsBody) =>
  POST(`${coreModelPath}/updateChannels`, data);

/** 批量启停模型，强制显式传递 channelType */
export const putModelsStatus = (data: UpdateModelStatusBody) =>
  PUT(`${coreModelPath}/updateStatus`, data);

/** 单个删除模型，内部统一转为批量格式并通过 Body 发送 */
export const deleteModel = ({ modelId, channelType }: ModelReference) =>
  deleteModels({ modelIds: [modelId], channelType });

/** 批量删除模型，强制显式传递 channelType */
export const deleteModels = (data: DeleteModelsBody) =>
  DELETE(`${coreModelPath}/delete`, data, { dataAsBody: true });

/** 测试模型调用（已安装实例），强制显式传递 channelType */
export const testModel = (data: TestModelQuery) => GET(`${coreModelPath}/test`, data);

/** 测试模型调用（草稿预览），强制显式传递 channelType */
export const testDraftModel = (data: TestDraftModelBody) => POST(`${coreModelPath}/test`, data);

/* ═══ 2. 平台管理员专属配置与备份 (/core/ai/model/*) ═══ */

/** 获取管理员系统模型列表 */
export const getAdminModelConfig = () =>
  getModelConfig<GetSystemModelConfigResponse>({ channelType: 'system' });

/** 导出全量系统模型配置 JSON */
export const getModelConfigJson = () => GET<string>(`${coreModelPath}/getConfigJson`);

/** 导入并替换全量系统模型配置 JSON */
export const putUpdateWithJson = (data: UpdateSystemModelsWithJsonBody) =>
  PUT(`${coreModelPath}/updateWithJson`, data);

/** 更新系统默认模型配置 */
export const putUpdateDefaultModels = (data: UpdateDefaultModelsBody) =>
  PUT(`${coreModelPath}/updateDefault`, data);
