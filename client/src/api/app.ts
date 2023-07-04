import { GET, POST, DELETE, PUT } from './request';
import type { AppSchema } from '@/types/mongoSchema';
import type { AppUpdateParams } from '@/types/app';
import { RequestPaging } from '../types/index';
import type { AppListResponse } from './response/app';

/**
 * 获取模型列表
 */
export const getMyModels = () => GET<AppListResponse>('/app/list');

/**
 * 创建一个模型
 */
export const postCreateModel = (data: { name: string }) => POST<string>('/app/create', data);

/**
 * 根据 ID 删除模型
 */
export const delModelById = (id: string) => DELETE(`/app/del?modelId=${id}`);

/**
 * 根据 ID 获取模型
 */
export const getModelById = (id: string) => GET<AppSchema>(`/app/detail?modelId=${id}`);

/**
 * 根据 ID 更新模型
 */
export const putAppById = (id: string, data: AppUpdateParams) =>
  PUT(`/app/update?appId=${id}`, data);

/* 共享市场 */
/**
 * 获取共享市场模型
 */
export const getShareModelList = (data: { searchText?: string } & RequestPaging) =>
  POST(`/app/share/getModels`, data);

/**
 * 收藏/取消收藏模型
 */
export const triggerModelCollection = (modelId: string) =>
  POST<number>(`/app/share/collection?modelId=${modelId}`);
