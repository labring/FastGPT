import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import type { GetMyModelsQuery, GetMyModelsResponse } from '@/pages/api/core/ai/model/getMyModels';
import { GET, POST } from '@/web/common/api/request';
import type { FastGPTFeConfigsType } from '@fastgpt/global/common/system/types';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

export const getSystemInitData = (bufferId?: string) =>
  GET<InitDateResponse>('/common/system/getInitData', {
    bufferId
  });

export const getProRuntimeFeConfigs = () =>
  GET<{ feConfigs?: Pick<FastGPTFeConfigsType, 'show_enterprise_auth'> }>(
    '/proApi/common/system/getFeConfigs'
  );

// model permissions

export const getModelCollaborators = (model: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    model
  });

export const updateModelCollaborators = (props: UpdateClbPermissionProps & { models: string[] }) =>
  POST('/proApi/system/model/collaborator/update', props);

export const getMyModels = (props: GetMyModelsQuery) =>
  GET<GetMyModelsResponse>('/core/ai/model/getMyModels', props);

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
