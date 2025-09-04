import type {
  UpdateAppCollaboratorBody,
  AppCollaboratorDeleteParams
} from '@fastgpt/global/core/app/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import type {
  CollaboratorItemDetailType,
  CollaboratorItemType
} from '@fastgpt/global/support/permission/collaborator';

export const getCollaboratorList = (appId: string) =>
  GET<CollaboratorItemDetailType[]>('/proApi/core/app/collaborator/list', { appId });

export const postUpdateAppCollaborators = (body: UpdateAppCollaboratorBody) =>
  POST('/proApi/core/app/collaborator/update', body);

export const deleteAppCollaborators = (params: AppCollaboratorDeleteParams) =>
  DELETE('/proApi/core/app/collaborator/delete', params);
