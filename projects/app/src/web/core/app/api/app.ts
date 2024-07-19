import { DELETE, GET, POST } from '@/web/common/api/request';
import type { CreateAppFolderBody } from '@/pages/api/core/app/folder/create';
import { ParentTreePathItemType } from '@fastgpt/global/common/parentFolder/type';
import { ParentIdType } from '@fastgpt/global/common/parentFolder/type';
import type {
  transitionWorkflowBody,
  transitionWorkflowResponse
} from '@/pages/api/core/app/transitionWorkflow';
import type { copyAppQuery, copyAppResponse } from '@/pages/api/core/app/copy';

/* folder */
export const postCreateAppFolder = (data: CreateAppFolderBody) =>
  POST('/core/app/folder/create', data);

export const getAppFolderPath = (parentId: ParentIdType) => {
  if (!parentId) return Promise.resolve<ParentTreePathItemType[]>([]);

  return GET<ParentTreePathItemType[]>(`/core/app/folder/path`, { parentId });
};

/* detail */
export const postTransition2Workflow = (data: transitionWorkflowBody) =>
  POST<transitionWorkflowResponse>('/core/app/transitionWorkflow', data);

export const postCopyApp = (data: copyAppQuery) => POST<copyAppResponse>('/core/app/copy', data);
