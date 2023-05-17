import { GET, POST, DELETE, PUT } from './request';
import type { ModelSchema } from '@/types/mongoSchema';
import type { ModelUpdateParams, ShareModelItem } from '@/types/model';
import { RequestPaging } from '../types/index';
import type { ModelListResponse } from './response/model';

/**
 * 获取模型列表
 */
export const getMyModels = () => GET<ModelListResponse>('/model/list');

/**
 * 创建一个模型
 */
export const postCreateModel = (data: { name: string }) => POST<string>('/model/create', data);

/**
 * 根据 ID 删除模型
 */
export const delModelById = (id: string) => DELETE(`/model/del?modelId=${id}`);

/**
 * 根据 ID 获取模型
 */
export const getModelById = (id: string) => GET<ModelSchema>(`/model/detail?modelId=${id}`);

/**
 * 根据 ID 更新模型
 */
export const putModelById = (id: string, data: ModelUpdateParams) =>
  PUT(`/model/update?modelId=${id}`, data);

/* 共享市场 */
/**
 * 获取共享市场模型
 */
export const getShareModelList = (data: { searchText?: string } & RequestPaging) =>
  POST(`/model/share/getModels`, data);
/**
 * 获取我收藏的模型
 */
export const getCollectionModels = () => GET<ShareModelItem[]>(`/model/share/getCollection`);
/**
 * 收藏/取消收藏模型
 */
export const triggerModelCollection = (modelId: string) =>
  POST<number>(`/model/share/collection?modelId=${modelId}`);
