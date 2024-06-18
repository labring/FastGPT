import { PostPublishAppProps, PostRevertAppProps } from '@/global/core/app/api';
import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import { AppVersionSchemaType } from '@fastgpt/global/core/app/version';
import { PaginationProps, PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type {
  getLatestVersionQuery,
  getLatestVersionResponse
} from '@/pages/api/core/app/version/latest';

export const getAppLatestVersion = (data: getLatestVersionQuery) =>
  GET<getLatestVersionResponse>('/core/app/version/latest', data);

export const postPublishApp = (appId: string, data: PostPublishAppProps) =>
  POST(`/core/app/version/publish?appId=${appId}`, data);

export const getPublishList = (data: PaginationProps<{ appId: string }>) =>
  POST<PaginationResponse<AppVersionSchemaType>>('/core/app/version/list', data);

export const postRevertVersion = (appId: string, data: PostRevertAppProps) =>
  POST(`/core/app/version/revert?appId=${appId}`, data);
