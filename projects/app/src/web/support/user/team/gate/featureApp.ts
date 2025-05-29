import type { ListAppBody } from '@/pages/api/core/app/list';
import { GET, POST } from '@/web/common/api/request';
import type { AppListItemType } from '@fastgpt/global/core/app/type';

// 类型定义

export type OperationResponse = {
  status: boolean;
  message?: string;
  featuredApps?: string[];
};

export type BatchResponse = {
  status: boolean;
  deletedCount?: number;
  updatedCount?: number;
  message?: string;
};

export type BatchUpdateRequest = {
  updates: {
    featuredApps: string[];
  }[];
};

// 获取特色应用列表
export const getFeatureApps = () =>
  GET<{ featuredApps: string[] }>('/proApi/support/user/team/gate/config/featureApps/get');

// 更新特色应用列表
export const updateFeatureApps = (featuredApps: string[]) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/featureApps/update', {
    featuredApps
  });

// 添加特色应用
export const addFeatureApp = (appId: string) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/featureApps/add', {
    appId
  });

// 删除特色应用
export const removeFeatureApp = (appId: string) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/featureApps/remove', {
    appId
  });

// 重新排序特色应用
export const reorderFeatureApps = (appId: string, toIndex: number) =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/featureApps/reorder', {
    appId,
    toIndex
  });

// 批量删除特色应用
export const batchDeleteFeatureApps = (appIds: string[]) =>
  POST<BatchResponse>('/proApi/support/user/team/gate/config/featureApps/batchDelete', {
    appIds
  });

// 批量更新特色应用
export const batchUpdateFeaturedApps = (updates: BatchUpdateRequest['updates']) =>
  POST<BatchResponse>('/proApi/support/user/team/gate/config/featureApps/batchUpdate', {
    updates
  });

// 清空特色应用列表
export const clearFeatureApps = () =>
  POST<OperationResponse>('/proApi/support/user/team/gate/config/featureApps/clear', {});

// 获取特色应用列表
export const listFeatureApps = (data?: ListAppBody) =>
  POST<AppListItemType[]>('/proApi/support/user/team/gate/config/featureApps/list', data, {
    maxQuantity: 1
  });
