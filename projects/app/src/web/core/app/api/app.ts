import { GET, POST } from '@/web/common/api/request';
import type {
  CopyAppBodyType,
  CopyAppResponseType,
  TransitionWorkflowBodyType,
  TransitionWorkflowResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type {
  CreateAppFolderBodyType,
  CreateAppFolderResponseType,
  GetAppFolderPathQueryType,
  GetAppFolderPathResponseType
} from '@fastgpt/global/openapi/core/app/folder/api';

/* folder */
export const postCreateAppFolder = (data: CreateAppFolderBodyType) =>
  POST<CreateAppFolderResponseType>('/core/app/folder/create', data);

export const getAppFolderPath = (data: GetAppFolderPathQueryType) => {
  if (!data.sourceId) return Promise.resolve<GetAppFolderPathResponseType>([]);

  return GET<GetAppFolderPathResponseType>(`/core/app/folder/path`, data);
};

/* detail */
export const postTransition2Workflow = (data: TransitionWorkflowBodyType) =>
  POST<TransitionWorkflowResponseType>('/core/app/transitionWorkflow', data);

export const postCopyApp = (data: CopyAppBodyType) =>
  POST<CopyAppResponseType>('/core/app/copy', data);
