import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { AppDetailType, AppListItemType } from '@fastgpt/global/core/app/type.d';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq.d';
import { AppUpdateParams } from '@/global/core/app/api';
import type { CreateAppBody } from '@/pages/api/core/app/create';
import type { ListAppBody } from '@/pages/api/core/app/list';

/**
 * 获取模型列表
 */
export const getMyApps = (data?: ListAppBody) => POST<AppListItemType[]>('/core/app/list', data);

/**
 * 创建一个模型
 */
export const postCreateApp = (data: CreateAppBody) => POST<string>('/core/app/create', data);

export const getMyAppsByTags = (data: {}) => POST(`/proApi/core/chat/team/getApps`, data);
/**
 * 根据 ID 删除模型
 */
export const delAppById = (id: string) => DELETE(`/core/app/del?appId=${id}`);

/**
 * 根据 ID 获取模型
 */
export const getAppDetailById = (id: string) => GET<AppDetailType>(`/core/app/detail?appId=${id}`);

/**
 * 根据 ID 更新模型
 */
export const putAppById = (id: string, data: AppUpdateParams) =>
  PUT(`/core/app/update?appId=${id}`, data);

// =================== chat logs
export const getAppChatLogs = (data: GetAppChatLogsParams) => POST(`/core/app/getChatLogs`, data);
