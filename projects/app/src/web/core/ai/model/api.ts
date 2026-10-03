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
  UpdateModelStatusBody,
  UpdateDefaultModelsBody,
  UpdateSystemModelsWithJsonBody,
  GetSystemModelsResponse,
  GetModelCatalogResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';
import type { ModelCollaboratorBatchListResponse } from '@fastgpt/global/support/permission/model/controller.schema';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';
import type {
  GetModelStatusResponse,
  ModelStatusProbeConfigResponse,
  RunModelStatusProbeResponse,
  UpdateModelStatusProbeConfigBody,
  TestModelStatusWebhookBody,
  TestModelStatusWebhookResponse
} from '@fastgpt/global/openapi/admin/system/model/status';

const adminModelPath = '/admin/system/model';
const coreModelPath = '/core/ai/model';

/* ═══ 1. 模型核心生命周期操作 (/core/ai/model/*) ═══ */

/** 获取团队私有模型及关联渠道 */
export const getTeamModelsConfig = () =>
  GET<GetTeamModelsResponse>(`${coreModelPath}/config`, { channelType: 'team' });

/** 获取模型模板列表 */
export const getModelTemplates = () => GET<GetModelTemplatesResponse>(`${coreModelPath}/templates`);

/** 创建模型（系统模型或团队私有模型），强制显式传递 channelType */
export const postCreateModel = (data: CreateModelBody & { channelType: 'system' | 'team' }) =>
  POST<CreateModelResponse>(`${coreModelPath}/create`, data);

/** 从模板批量创建模型，强制显式传递 channelType */
export const postModelsFromTemplates = (
  data: CreateModelsFromTemplatesBody & { channelType: 'system' | 'team' }
) => POST<CreateModelsFromTemplatesResponse>(`${coreModelPath}/createFromTemplates`, data);

/** 获取模型详情（携带关联渠道状态），强制显式传递 channelType */
export const getModelDetail = (modelId: string, channelType: 'system' | 'team') =>
  GET<GetModelDetailResponse>(`${coreModelPath}/detail`, {
    modelId,
    channelType
  });

/** 更新模型配置，强制显式传递 channelType */
export const putUpdateModel = (data: UpdateModelBody & { channelType: 'system' | 'team' }) =>
  PUT(`${coreModelPath}/update`, data);

/** 批量启停模型，强制显式传递 channelType */
export const putModelsStatus = (data: UpdateModelStatusBody & { channelType: 'system' | 'team' }) =>
  PUT(`${coreModelPath}/updateStatus`, data);

/** 单个删除模型，强制显式传递 channelType */
export const deleteModel = (data: ModelReference & { channelType: 'system' | 'team' }) =>
  DELETE(`${coreModelPath}/delete`, data);

/** 批量删除模型，强制显式传递 channelType */
export const deleteModels = (data: DeleteModelsBody & { channelType: 'system' | 'team' }) =>
  DELETE(`${coreModelPath}/delete`, data, { dataAsBody: true });

/** 测试模型调用（已安装实例），强制显式传递 channelType */
export const testModel = (data: TestModelQuery & { channelType: 'system' | 'team' }) =>
  GET(`${coreModelPath}/test`, data);

/** 测试模型调用（草稿预览），强制显式传递 channelType */
export const testDraftModel = (data: TestDraftModelBody & { channelType: 'system' | 'team' }) =>
  POST(`${coreModelPath}/test`, data);

/* ═══ 2. 平台管理员专属配置与备份 (/core/ai/model/*) ═══ */

/** 获取管理员系统模型列表 */
export const getAdminModelConfig = () =>
  GET<GetSystemModelConfigResponse>(`${coreModelPath}/config`, { channelType: 'system' });

/** 导出全量系统模型配置 JSON */
export const getModelConfigJson = () => GET<string>(`${coreModelPath}/getConfigJson`);

/** 导入并替换全量系统模型配置 JSON */
export const putUpdateWithJson = (data: UpdateSystemModelsWithJsonBody) =>
  PUT(`${coreModelPath}/updateWithJson`, data);

/** 更新系统默认模型配置 */
export const putUpdateDefaultModels = (data: UpdateDefaultModelsBody) =>
  PUT(`${coreModelPath}/updateDefault`, data);

/* ═══ 3. 模型状态探测与健康监控 (/admin/system/model/status/*) ═══ */

/** 获取模型探测状态监控数据 */
export const getModelStatus = () => GET<GetModelStatusResponse>(`${adminModelPath}/status`);

/** 更新模型探测配置 */
export const putModelStatusProbeConfig = (data: UpdateModelStatusProbeConfigBody) =>
  PUT<ModelStatusProbeConfigResponse>(`${adminModelPath}/status/config`, data);

/** 手动触发一次全局模型状态探测 */
export const postModelStatusProbe = () =>
  POST<RunModelStatusProbeResponse>(`${adminModelPath}/status/probe`, {}, { timeout: 600000 });

/** 测试模型状态告警 Webhook 连通性 */
export const postTestModelStatusWebhook = (data: TestModelStatusWebhookBody) =>
  POST<TestModelStatusWebhookResponse>(`${adminModelPath}/status/testWebhook`, data);

/* ═══ 4. 公开目录与协作者权限 (/core/ai/model/*, /proApi/system/model/collaborator/*) ═══ */

export const getPublicModelList = () =>
  GET<GetSystemModelsResponse>(`${coreModelPath}/list`, undefined, {
    deduplicate: true
  }).then((res) => res.models);

export const getPublicModelCatalog = () =>
  GET<GetSystemModelsResponse>(`${coreModelPath}/list`, undefined, { deduplicate: true });

export const getUserModelCatalog = ({
  version,
  outLinkAuthData
}: {
  version?: string;
  outLinkAuthData?: OutLinkChatAuthProps;
} = {}) =>
  GET<GetModelCatalogResponse>(
    `${coreModelPath}/catalog`,
    {
      version,
      outLinkAuthData: outLinkAuthData ? JSON.stringify(outLinkAuthData) : undefined
    },
    { deduplicate: true }
  );

export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    modelId
  });

export const getBatchModelCollaborators = (modelIds: string[]) =>
  POST<ModelCollaboratorBatchListResponse>('/proApi/system/model/collaborator/batchList', {
    modelIds
  });

export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelIds: string[] }
) => POST('/proApi/system/model/collaborator/update', props);
