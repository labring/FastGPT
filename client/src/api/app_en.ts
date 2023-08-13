import { GET, POST, DELETE, PUT } from './request';
import type { AppSchema } from '@/types/mongoSchema';
import type { AppListItemType, AppUpdateParams } from '@/types/app';
import { RequestPaging } from '../types/index';
import type { Props as CreateAppProps } from '@/pages/api/app/create';
import { addDays } from 'date-fns';

/**
 * Get the list of models
 */
export const getMyModels = () => GET<AppListItemType[]>('/app/myApps');

/**
 * Create a model
 */
export const postCreateApp = (data: CreateAppProps) => POST<string>('/app/create', data);

/**
 * Delete a model by ID
 */
export const delModelById = (id: string) => DELETE(`/app/del?appId=${id}`);

/**
 * Get a model by ID
 */
export const getModelById = (id: string) => GET<AppSchema>(`/app/detail?appId=${id}`);

/**
 * Update a model by ID
 */
export const putAppById = (id: string, data: AppUpdateParams) =>
  PUT(`/app/update?appId=${id}`, data);

/* Shared Market */
/**
 * Get shared market models
 */
export const getShareModelList = (data: { searchText?: string } & RequestPaging) =>
  POST(`/app/share/getModels`, data);

/**
 * Collect/uncollect a model
 */
export const triggerModelCollection = (appId: string) =>
  POST<number>(`/app/share/collection?appId=${appId}`);

// ====================== data
export const getAppTotalUsage = (data: { appId: string }) =>
  POST<{ date: String; total: number }[]>(`/app/data/totalUsage`, {
    ...data,
    start: addDays(new Date(), -13),
    end: addDays(new Date(), 1)
  }).then((res) => (res.length === 0 ? [{ date: new Date(), total: 0 }] : res));
