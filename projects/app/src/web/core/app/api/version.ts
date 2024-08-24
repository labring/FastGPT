import { PostPublishAppProps, PostRevertAppProps } from '@/global/core/app/api';
import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  getLatestVersionQuery,
  getLatestVersionResponse
} from '@/pages/api/core/app/version/latest';
import { UpdateAppVersionBody } from '@/pages/api/core/app/version/update';
import { versionListResponse } from '@/pages/api/core/app/version/listWorkflow';

export const getAppLatestVersion = (data: getLatestVersionQuery) =>
  GET<getLatestVersionResponse>('/core/app/version/latest', data);

export const postPublishApp = (appId: string, data: PostPublishAppProps) =>
  POST(`/core/app/version/publish?appId=${appId}`, data);

export const getPublishList = (data: PaginationProps<{ appId: string }>) =>
  POST<PaginationResponse<AppVersionSchemaType>>('/core/app/version/list', data);

export const getWorkflowVersionList = (data: PaginationProps<{ appId: string }>) =>
  POST<PaginationResponse<versionListResponse>>('/core/app/version/listWorkflow', data);

export const getAppVersionDetail = (versionId: string, appId: string) =>
  GET<AppVersionSchemaType>(`/core/app/version/detail?versionId=${versionId}&appId=${appId}`);

export const postRevertVersion = (appId: string, data: PostRevertAppProps) =>
  POST(`/core/app/version/revert?appId=${appId}`, data);

export const updateAppVersion = (data: UpdateAppVersionBody) =>
  POST(`/core/app/version/update`, data);
