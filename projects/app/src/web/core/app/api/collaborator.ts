import type { AppCollaboratorDeleteParams } from '@fastgpt/global/core/app/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import type {
  GetAppCollaboratorListQueryType,
  GetAppCollaboratorListResponseType,
  UpdateAppCollaboratorBodyType,
  UpdateAppCollaboratorResponseType
} from '@fastgpt/global/openapi/support/permission/api';

export const getCollaboratorList = (appId: GetAppCollaboratorListQueryType['appId']) =>
  GET<GetAppCollaboratorListResponseType>('/proApi/core/app/collaborator/list', { appId });

export const postUpdateAppCollaborators = (body: UpdateAppCollaboratorBodyType) =>
  POST<UpdateAppCollaboratorResponseType>('/proApi/core/app/collaborator/update', body);

export const deleteAppCollaborators = (params: AppCollaboratorDeleteParams) =>
  DELETE('/proApi/core/app/collaborator/delete', params);
