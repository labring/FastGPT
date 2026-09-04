import { DELETE, GET, POST, PUT } from '@/web/common/api/request';
import type {
  AdminSystemModelReference,
  CreateSystemModelBody,
  CreateSystemModelResponse,
  CreateSystemModelsFromTemplatesBody,
  CreateSystemModelsFromTemplatesResponse,
  DeleteSystemModelsBody,
  GetAdminModelTemplatesResponse,
  GetAdminSystemModelDetailResponse,
  GetAdminSystemModelListResponse,
  ReplaceSystemModelChannelsBody,
  TestAdminSystemModelQuery,
  TestDraftAdminSystemModelBody,
  UpdateDefaultModelsBody,
  UpdateSystemModelBody,
  UpdateSystemModelStatusBody,
  UpdateSystemModelsWithJsonBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

const adminModelPath = '/admin/settings/model';

export const getAdminModelConfig = () =>
  GET<GetAdminSystemModelListResponse>(`${adminModelPath}/list`);
export const getSystemModelDetail = (modelId: string) =>
  GET<GetAdminSystemModelDetailResponse>(`${adminModelPath}/detail`, { modelId });

export const postSystemModel = (data: CreateSystemModelBody) =>
  POST<CreateSystemModelResponse>(`${adminModelPath}/create`, data);
export const getAdminModelTemplates = () =>
  GET<GetAdminModelTemplatesResponse>(`${adminModelPath}/templates`);
export const postSystemModelsFromTemplates = (data: CreateSystemModelsFromTemplatesBody) =>
  POST<CreateSystemModelsFromTemplatesResponse>(`${adminModelPath}/createFromTemplates`, data);
export const putReplaceSystemModelChannels = (data: ReplaceSystemModelChannelsBody) =>
  PUT(`${adminModelPath}/channel/replace`, data);
export const putSystemModel = (data: UpdateSystemModelBody) =>
  PUT(`${adminModelPath}/update`, data);
export const putSystemModelsStatus = (data: UpdateSystemModelStatusBody) =>
  PUT(`${adminModelPath}/updateStatus`, data);

export const deleteSystemModel = (data: AdminSystemModelReference) =>
  DELETE(`${adminModelPath}/delete`, data);
export const deleteSystemModels = (data: DeleteSystemModelsBody) =>
  DELETE(`${adminModelPath}/delete`, data, { dataAsBody: true });

export const getModelConfigJson = () => GET<string>(`${adminModelPath}/getConfigJson`);
export const putUpdateWithJson = (data: UpdateSystemModelsWithJsonBody) =>
  PUT(`${adminModelPath}/updateWithJson`, data);

export const getTestModel = (data: TestAdminSystemModelQuery) =>
  GET(`${adminModelPath}/test`, data);
export const postTestDraftModel = (data: TestDraftAdminSystemModelBody) =>
  POST(`${adminModelPath}/test`, data);

export const putUpdateDefaultModels = (data: UpdateDefaultModelsBody) =>
  PUT(`${adminModelPath}/updateDefault`, data);
