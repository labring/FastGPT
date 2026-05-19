import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { GET, POST } from '@/web/common/api/request';
import type {
  CollaboratorListType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

export const getSystemInitData = (bufferId?: string) =>
  GET<InitDateResponse>('/common/system/getInitData', {
    bufferId
  });

// model permissions

export const getModelCollaborators = (modelId: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    modelId
  });

export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelIds: string[] }
) => POST('/proApi/system/model/collaborator/update', props);

/* 活动 banner */
export const getOperationalAd = () =>
  GET<{ id: string; operationalAdImage: string; operationalAdLink: string }>(
    '/proApi/support/user/inform/getOperationalAd'
  );

export const getActivityAd = () =>
  GET<{ id: string; activityAdImage: string; activityAdLink: string }>(
    '/proApi/support/user/inform/getActivityAd'
  );
