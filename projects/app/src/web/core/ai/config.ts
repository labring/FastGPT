import { GET, PUT, DELETE, POST } from '@/web/common/api/request';
import type {
  ListModelsResponse,
  ListModelsBody,
  ListModelsPaginationResponse,
  CreateModelBody,
  UpdateModelBody,
  DeleteModelQuery,
  TestModelQuery,
  UpdateWithJsonBody,
  UpdateDefaultModelBody,
  GetConfigJsonResponse,
  GetModelDetailResponse,
  GetDefaultConfigResponse
} from '@fastgpt/global/openapi/core/ai/model/api';

export function getSystemModelList() {
  return POST<ListModelsResponse>('/core/ai/model/list', {});
}

export const getSystemModelPageList = (data: ListModelsBody) =>
  POST<ListModelsPaginationResponse>('/core/ai/model/list', data);

export const getSystemModelDetail = (id: string) =>
  GET<GetModelDetailResponse>('/core/ai/model/detail', { id });

export const getSystemModelDefaultConfig = (modelId: string) =>
  GET<GetDefaultConfigResponse>('/core/ai/model/getDefaultConfig', { modelId });

export const putSystemModel = (data: UpdateModelBody) => PUT('/core/ai/model/update', data);

export const postSystemModel = (data: CreateModelBody) => POST('/core/ai/model/create', data);

export const deleteSystemModel = (data: DeleteModelQuery) => DELETE('/core/ai/model/delete', data);

export const getModelConfigJson = () => GET<GetConfigJsonResponse>('/core/ai/model/getConfigJson');
export const putUpdateWithJson = (data: UpdateWithJsonBody) =>
  PUT('/core/ai/model/updateWithJson', data);

export const getTestModel = (data: TestModelQuery) => GET('/core/ai/model/test', data);

export const putUpdateDefaultModels = (data: UpdateDefaultModelBody) =>
  PUT('/core/ai/model/updateDefault', data);
