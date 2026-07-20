import { GET, PUT, DELETE, POST } from '@/web/common/api/request';
import type { SystemModelItemType } from '@fastgpt/global/core/ai/model/type';
import type {
  CreateModelBody,
  ListModelsBody,
  ListModelsPaginationResponse,
  UpdateModelBody,
  DeleteModelQuery,
  TestModelQuery,
  UpdateWithJsonBody,
  UpdateSystemDefaultModelBody,
  GetSystemDefaultModelResponse,
  GetModelDetailQuery,
  GetModelDetailResponse,
  GetModelTemplatesResponse,
  TestModelResponse,
  UsageLogBody,
  UsageLogPaginationResponse,
  UsageStatsBody,
  UsageStatsResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

export type ModelTemplateType = Pick<
  SystemModelItemType,
  'provider' | 'model' | 'name' | 'avatar' | 'type'
> & {
  defaultConfig?: Record<string, any>;
  fieldMap?: Record<string, string>;
  maxContext?: number;
  maxResponse?: number;
  vision?: boolean;
  functionCall?: boolean;
  reasoning?: boolean;
  toolChoice?: boolean;
  voices?: { label: string; value: string }[];
};

/** Fetches models accessible to the current user and returns the response list. */
export const getModelList = async (params?: ListModelsBody) => {
  const res = await POST<ListModelsPaginationResponse>(
    '/core/ai/model/list',
    params ?? {},
    // Deduplicate concurrent identical requests so multiple lazy components
    // fetching the same list share one in-flight call (design §1 Lazy Load).
    { deduplicate: true }
  );
  return res.list;
};

/** Fetches one model list page for selectors and management tables. */
export const getModelListPage = (params?: ListModelsBody) =>
  POST<ListModelsPaginationResponse>('/core/ai/model/list', params ?? {});

/** Fetches the system default model configuration. */
export const getSystemDefault = () =>
  GET<GetSystemDefaultModelResponse>('/core/ai/model/getSystemDefault', {}, { deduplicate: true });

/** Fetches an accessible system or private model by ID. */
export const getModelDetail = (query: GetModelDetailQuery): Promise<GetModelDetailResponse> =>
  GET<GetModelDetailResponse>('/core/ai/model/detail', query);

export const getModelTemplates = (query: { provider?: string; type?: string; search?: string }) =>
  GET<GetModelTemplatesResponse>('/core/ai/model/templates', query);

export const putSystemModel = (data: UpdateModelBody) => PUT('/core/ai/model/update', data);

/** Creates a model; the backend assigns its ID. */
export const createSystemModel = (data: CreateModelBody) => POST('/core/ai/model/create', data);

export const deleteSystemModel = (data: DeleteModelQuery) => DELETE('/core/ai/model/delete', data);

export const getModelConfigJson = () => GET<string>('/core/ai/model/getConfigJson');
export const putUpdateWithJson = (data: UpdateWithJsonBody) =>
  PUT('/core/ai/model/updateWithJson', data);

export const getTestModel = (data: TestModelQuery) =>
  GET<TestModelResponse>('/core/ai/model/test', data);

export const putUpdateDefaultModels = (data: UpdateSystemDefaultModelBody) =>
  PUT('/core/ai/model/updateSystemDefault', data);

/** Fetches model collaborators through the Pro endpoint. */
export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>(`/proApi/system/model/collaborator/list`, { modelId });

/** Updates the model's read-only collaborators through the Pro endpoint. */
export const updateModelCollaborators = (data: UpdateClbPermissionProps & { modelIds: string[] }) =>
  POST(`/proApi/system/model/collaborator/update`, data);

/** Fetches usage logs for accessible models. */
export const getUsageLogs = (params: UsageLogBody) =>
  POST<UsageLogPaginationResponse>('/core/ai/model/usageLogs', params);

/** Fetches aggregated usage statistics for accessible models. */
export const getUsageStats = (params: UsageStatsBody) =>
  POST<UsageStatsResponse>('/core/ai/model/usageStats', params);
