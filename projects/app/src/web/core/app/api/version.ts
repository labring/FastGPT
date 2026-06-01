import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  AppVersionListBodyType,
  AppVersionListResponseType,
  GetAppVersionDetailQueryType,
  GetAppVersionDetailResponseType,
  GetLatestAppVersionQueryType,
  GetLatestAppVersionResponseType,
  PublishAppBodyType,
  PublishAppQueryType,
  PublishAppResponseType,
  UpdateAppVersionBodyType,
  UpdateAppVersionResponseType
} from '@fastgpt/global/openapi/core/app/version/api';

export const getAppLatestVersion = (data: GetLatestAppVersionQueryType) =>
  GET<GetLatestAppVersionResponseType>('/core/app/version/latest', data);

export const postPublishApp = (appId: PublishAppQueryType['appId'], data: PublishAppBodyType) =>
  POST<PublishAppResponseType>(`/core/app/version/publish?appId=${appId}`, data);

export const getAppVersionList = (data: AppVersionListBodyType) =>
  POST<AppVersionListResponseType>('/core/app/version/list', data);

export const getAppVersionDetail = (
  versionId: GetAppVersionDetailQueryType['versionId'],
  appId: GetAppVersionDetailQueryType['appId']
) =>
  GET<GetAppVersionDetailResponseType>(
    `/core/app/version/detail?versionId=${versionId}&appId=${appId}`
  );

export const updateAppVersion = (data: UpdateAppVersionBodyType) =>
  PUT<UpdateAppVersionResponseType>(`/core/app/version/update`, data);
