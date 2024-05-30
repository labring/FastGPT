import { AddAppCollaboratorRequest } from '@/pages/api/core/app/collaborator/add';
import { GET, POST } from '@/web/common/api/request';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';

export const getCollaboratorList = (appId: string) =>
  GET<AppCollaboratorType[]>('/core/app/collaborator/list', { appId });

export const addAppCollaborators = ({ ...parms }: AddAppCollaboratorRequest) =>
  POST('/core/app/collaborator/add', { ...parms });
