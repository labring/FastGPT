import type { ListAppBody } from '@/pages/api/core/app/list';
import { GET, POST } from '@/web/common/api/request';
import type { AppListItemType } from '@fastgpt/global/core/app/type';

// 类型定义

export type OperationResponse = {
  status: boolean;
  message?: string;
  quickApps?: string[];
};

export type BatchResponse = {
  status: boolean;
  deletedCount?: number;
  updatedCount?: number;
  message?: string;
};

export type BatchUpdateRequest = {
  updates: {
    quickApps: string[];
  }[];
};

// 获取快速应用列表
export const getQuickApps = () =>
  GET<{ quickApps: string[] }>('/proApi/support/user/team/gate/config/quickApps/get');

// 更新快速应用列表
export const updateQuickApps = (quickApps: string[]) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/quickApps/update', {
    quickApps
  });

// 添加快速应用
export const addQuickApp = (appId: string) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/quickApps/add', {
    appId
  });

// 删除快速应用
export const removeQuickApp = (appId: string) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/quickApps/remove', {
    appId
  });

// 重新排序快速应用
export const reorderQuickApps = (appId: string, toIndex: number) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/quickApps/reorder', {
    appId,
    toIndex
  });

// 批量删除快速应用
export const batchDeleteQuickApps = (appIds: string[]) =>
  POST<BatchResponse>('/proApi/support/user/team/gate/config/quickApps/batchDelete', {
    appIds
  });

// 批量更新快速应用
export const batchUpdateQuickApps = (updates: BatchUpdateRequest['updates']) =>
  POST<BatchResponse>('/proApi/support/user/team/gate/config/quickApps/batchUpdate', {
    updates
  });

// 清空快速应用列表
export const clearQuickApps = () =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/quickApps/clear', {});

// 获取快速应用列表
export const listQuickApps = (data?: ListAppBody) =>
  POST<AppListItemType[]>('/proApi/support/user/team/gate/config/quickApps/list', data, {
    maxQuantity: 1
  });
