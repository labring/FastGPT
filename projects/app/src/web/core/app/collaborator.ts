import { AddAppCollaboratorRequest } from '@/pages/api/core/app/collaborator/add';
import { AppCollaboratorDeleteParams } from '@/pages/api/core/app/collaborator/delete';
import { DELETE, GET, POST } from '@/web/common/api/request';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';

export const getCollaboratorList = (appId: string) =>
  GET<AppCollaboratorType[]>('/core/app/collaborator/list', { appId });

export const addAppCollaborators = ({ ...parms }: AddAppCollaboratorRequest) =>
  POST('/core/app/collaborator/add', { ...parms });

export const updateAppCollaborators = ({ ...parms }: AddAppCollaboratorRequest) =>
  POST('/core/app/collaborator/add', { ...parms }); // the same api with add

export const deleteAppCollaborators = ({ ...params }: AppCollaboratorDeleteParams) =>
  DELETE('/core/app/collaborator/delete', { ...params });
