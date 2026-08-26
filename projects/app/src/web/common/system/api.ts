import type {
  GetSystemInitDataResponse,
  GetSystemModelsResponse
} from '@fastgpt/global/openapi/common/system/api';
import type { GetMyModelsQuery, GetMyModelsResponse } from '@/pages/api/core/ai/model/getMyModels';
import type {
  GetMyModelQuery,
  GetMyModelResponse
} from '@fastgpt/global/openapi/core/ai/model/api';
import { GET, POST } from '@/web/common/api/request';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

export const getSystemInitData = (bufferId?: string) =>
  GET<GetSystemInitDataResponse>('/common/system/getInitData', {
    bufferId
  });

export const getSystemModels = () =>
  GET<GetSystemModelsResponse>('/common/system/getSystemModels', undefined, { deduplicate: true });

// model permissions

export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    modelId
  });

export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelIds: string[] }
) => POST('/proApi/system/model/collaborator/update', props);

export const getMyModels = (props: GetMyModelsQuery) =>
  GET<GetMyModelsResponse>('/core/ai/model/getMyModels', props, { deduplicate: true });

export const getMyModel = (props: GetMyModelQuery) =>
  GET<GetMyModelResponse>('/core/ai/model/getMyModel', props, { deduplicate: true });

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
