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

export const getModelCollaborators = (modelName: string) =>
  GET<CollaboratorListType>('/proApi/system/model/collaborator/list', {
    modelName
  });

export const updateModelCollaborators = (
  props: UpdateClbPermissionProps & { modelNames: string[] }
) => POST('/proApi/system/model/collaborator/update', props);
