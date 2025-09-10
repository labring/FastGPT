import type { InitDateResponse } from '@/pages/api/common/system/getInitData';
import { GET, POST } from '@/web/common/api/request';
import type {
  CollaboratorItemDetailType,
  UpdateClbPermissionProps
} from '@fastgpt/global/support/permission/collaborator';

export const getSystemInitData = (bufferId?: string) =>
  GET<InitDateResponse>('/common/system/getInitData', {
    bufferId
  });

// model permissions

export const getModelCollaborators = (modelName: string) =>
  GET<CollaboratorItemDetailType[]>('/proApi/system/model/collaborator/list', {
    modelName
  });

export const updateModelCollaborators = (props: UpdateClbPermissionProps & { modelName: string }) =>
  POST('/proApi/system/model/collaborator/update', props);
