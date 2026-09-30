import type { ReferencedAppsResponse } from '@fastgpt/global/core/app/type';
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

/* referenced apps */
/**
 * Fetch published apps that reference the specified app or apps inside the app folder.
 */
export const getReferencedAppsByAppId = (appId: string) =>
  GET<ReferencedAppsResponse>('/core/app/referencedAppsByAppId', { appId });

/**
 * Fetch published apps that reference the specified tool or tools inside the tool folder.
 */
export const getAppsByToolId = (toolId: string) =>
  GET<ReferencedAppsResponse>('/core/app/appsByToolId', { toolId });
