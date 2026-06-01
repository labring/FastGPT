import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { AppChangeOwnerBody } from '@/global/core/app/api';
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
  UpdateAppQueryType,
  UpdateAppBodyType,
  UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type {
  GetAppPermissionQueryType,
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

/**
 * 创建一个应用
 */
export const postCreateApp = (data: CreateAppBodyType) =>
  POST<CreateAppResponseType>('/core/app/create', data);

export const getMyAppsByTags = (data: Record<string, unknown>) =>
  POST(`/proApi/core/chat/team/getApps`, data);
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

export const changeOwner = (data: AppChangeOwnerBody) => POST(`/proApi/core/app/changeOwner`, data);
