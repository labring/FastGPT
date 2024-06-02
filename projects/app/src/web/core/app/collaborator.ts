import {
  AddAppCollaboratorRequest,
  AppCollaboratorDeleteParams
} from '@fastgpt/global/core/app/collaborator';
import { DELETE, GET, POST } from '@/web/common/api/request';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';

export const getCollaboratorList = (appId: string) =>
  GET<AppCollaboratorType[]>('/proApi/core/app/collaborator/list', { appId });

export const addAppCollaborators = ({ ...parms }: AddAppCollaboratorRequest) =>
  POST('/proApi/core/app/collaborator/add', { ...parms });

export const updateAppCollaborators = ({ ...parms }: AddAppCollaboratorRequest) =>
  POST('/proApi/core/app/collaborator/add', { ...parms }); // the same api with add

export const deleteAppCollaborators = ({ ...params }: AppCollaboratorDeleteParams) =>
  DELETE('/proApi/core/app/collaborator/delete', { ...params });
