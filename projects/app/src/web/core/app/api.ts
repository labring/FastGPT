import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { AppPermissionCheckType } from '@fastgpt/global/support/permission/app/controller.schema';

import type {
  CreateAppBodyType,
  CreateAppResponseType,
  DeleteAppQueryType,
  DeleteAppResponseType,
  GetAppBasicInfoBodyType,
  GetAppBasicInfoResponseType,
  GetAppDetailQueryType,
  GetAppDetailResponseType,
  ListAppBodyType,
  ListAppResponseType,
  ListAppV2BodyType,
  ListAppV2ResponseType,
  UpdateAppQueryType,
  UpdateAppBodyType,
  UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type {
  GetAppPermissionQueryType,
  ChangeAppOwnerBodyType,
  ChangeAppOwnerResponseType,
  ResumeInheritPermissionQueryType,
  ResumeInheritPermissionResponseType
} from '@fastgpt/global/openapi/core/app/permission/api';

/**
 * 获取应用列表
 */
export const getMyApps = (data?: ListAppBodyType) =>
  POST<ListAppResponseType>('/core/app/list', data, {
    maxQuantity: 1
  });

export const getMyAppsV2 = (data?: ListAppV2BodyType) =>
  POST<ListAppV2ResponseType>('/core/app/listV2', data, {
    maxQuantity: 1
  });

/** 获取当前筛选条件下的全部应用，供需要跨页遍历资源的选择器使用。 */
export const getAllApps = (data?: ListAppBodyType) => getMyApps(data);

/**
 * 创建一个应用
 */
export const postCreateApp = (data: CreateAppBodyType) =>
  POST<CreateAppResponseType>('/core/app/create', data);

/**
 * 根据 ID 删除应用
 */
export const delAppById = (id: DeleteAppQueryType['appId']) =>
  DELETE<DeleteAppResponseType>(`/core/app/del?appId=${id}`);

/**
 * 根据 ID 获取应用
 */
export const getAppDetailById = (id: GetAppDetailQueryType['appId']) =>
  GET<GetAppDetailResponseType>(`/core/app/detail?appId=${id}`);

/**
 * 根据 ID 更新应用
 */
export const putAppById = (id: UpdateAppQueryType['appId'], data: UpdateAppBodyType) =>
  PUT<UpdateAppResponseType>(`/core/app/update?appId=${id}`, data);

export const getAppPermission = (appId: GetAppPermissionQueryType['appId']) =>
  GET<AppPermissionCheckType>(`/core/app/getPermission?appId=${appId}`);

/**
 * Get app basic info by ids
 */
export const getAppBasicInfoByIds = (ids: GetAppBasicInfoBodyType['ids']) =>
  POST<GetAppBasicInfoResponseType>(`/core/app/getBasicInfo`, { ids });

export const resumeInheritPer = (appId: ResumeInheritPermissionQueryType['appId']) =>
  PUT<ResumeInheritPermissionResponseType>(`/core/app/resumeInheritPermission?appId=${appId}`).then(
    () => undefined
  );

export const changeOwner = (data: ChangeAppOwnerBodyType) =>
  POST<ChangeAppOwnerResponseType>(`/proApi/core/app/changeOwner`, data);
