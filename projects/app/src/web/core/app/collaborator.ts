import { GET } from '@/web/common/api/request';
import { AppCollaboratorType } from '@fastgpt/global/core/app/type';

export const getCollaboratorList = (appId: string) =>
  GET<AppCollaboratorType[]>('/core/app/collaborator/list', { appId });
