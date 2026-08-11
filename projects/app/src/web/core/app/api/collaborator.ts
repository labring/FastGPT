import { GET, POST } from '@/web/common/api/request';
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
