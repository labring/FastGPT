import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { AppDetailType, AppListItemType } from '@fastgpt/global/core/app/type';
import type { AppUpdateParams, AppChangeOwnerBody } from '@/global/core/app/api';
import type { ListAppBody } from '@/pages/api/core/app/list';

import type { getBasicInfoResponse } from '@/pages/api/core/app/getBasicInfo';
import type {
  CreateAppBodyType,
  GetAppPermissionResponseType
} from '@fastgpt/global/openapi/core/app/common/api';

/**
 * 获取应用列表（不分页，向后兼容）
 */
export const getMyApps = (data?: Omit<ListAppBody, 'pageNum' | 'pageSize'>) =>
  POST<AppListItemType[]>('/core/app/list', data, {
    maxQuantity: 1
  });

/**
 * 获取应用列表（分页模式），返回 { list, total }
 */
export const getMyAppsPaginated = (
  data: Required<Pick<ListAppBody, 'pageNum' | 'pageSize'>> &
    Omit<ListAppBody, 'pageNum' | 'pageSize'>
) =>
  POST<{ list: AppListItemType[]; total: number }>('/core/app/list', data, {
    maxQuantity: 1
  });

/**
 * 创建一个应用
 */
export const postCreateApp = (data: CreateAppBodyType) => POST<string>('/core/app/create', data);

export const getMyAppsByTags = (data: {}) => POST(`/proApi/core/chat/team/getApps`, data);
/**
 * 根据 ID 删除应用
 */
export const delAppById = (id: string) => DELETE<string[]>(`/core/app/del?appId=${id}`);

/**
 * 根据 ID 获取应用
 */
export const getAppDetailById = (id: string) => GET<AppDetailType>(`/core/app/detail?appId=${id}`);

/**
 * 根据 ID 更新应用
 */
export const putAppById = (id: string, data: AppUpdateParams) =>
  PUT(`/core/app/update?appId=${id}`, data);

export const getAppPermission = (appId: string) =>
  GET<GetAppPermissionResponseType>(`/core/app/getPermission?appId=${appId}`);

/**
 * Get app basic info by ids
 */
export const getAppBasicInfoByIds = (ids: string[]) =>
  POST<getBasicInfoResponse>(`/core/app/getBasicInfo`, { ids });

export const resumeInheritPer = (appId: string) =>
  GET(`/core/app/resumeInheritPermission`, { appId });

export const changeOwner = (data: AppChangeOwnerBody) => POST(`/proApi/core/app/changeOwner`, data);

export const getAppsByToolId = (toolId: string) =>
  GET<import('@/pages/api/core/app/appsByToolId').AppsByToolIdItem[]>(
    `/core/app/appsByToolId?toolId=${toolId}`
  );

/**
 * 导出应用为 SKILL
 */
export const postExportSkill = async (data: {
  appId: string;
  skillName: string;
  skillDescription: string;
}): Promise<Blob> => {
  const { instance } = await import('@/web/common/api/request');
  const { getWebReqUrl } = await import('@fastgpt/web/common/system/utils');

  const response = await instance.request({
    baseURL: getWebReqUrl('/api'),
    url: `/core/app/exportSkill?appId=${data.appId}`,
    method: 'POST',
    data: {
      skillName: data.skillName,
      skillDescription: data.skillDescription
    },
    responseType: 'blob'
  });

  return response.data;
};
