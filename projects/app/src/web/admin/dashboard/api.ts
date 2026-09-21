import { GET, POST } from '@/web/admin/common/request';
import type {
  GetAppStatsResponseType,
  GetChatFormDataResponseType,
  GetCostFormDataResponseType,
  GetDataChartsQueryType,
  GetDatasetStatsResponseType,
  GetPaysFormDataResponseType,
  GetQpmRangeResponseType,
  GetUserFormDataResponseType,
  GetUserStatsResponseType
} from '@fastgpt/global/openapi/admin/dashboard/api';

type DashboardRequestConfig = Parameters<typeof GET>[2];

export const getUserStats = () =>
  GET<GetUserStatsResponseType>('/proApi/admin/dashboard/getUserStats');

export const getAppStats = () =>
  GET<GetAppStatsResponseType>('/proApi/admin/dashboard/getAppStats');

export const getDatasetStats = () =>
  GET<GetDatasetStatsResponseType>('/proApi/admin/dashboard/getDatasetStats');

export const getChatFormData = (params: GetDataChartsQueryType, config?: DashboardRequestConfig) =>
  GET<GetChatFormDataResponseType>('/proApi/admin/dashboard/getChatFormData', params, config);

export const getWorkflowQpmRange = (params: GetDataChartsQueryType) =>
  GET<GetQpmRangeResponseType>('/proApi/admin/dashboard/getWorkflowQpmRange', params);

export const getCostFormData = (data: GetDataChartsQueryType) =>
  POST<GetCostFormDataResponseType>('/proApi/admin/dashboard/getCostFormData', data);

export const getPaysFormData = (params: GetDataChartsQueryType) =>
  GET<GetPaysFormDataResponseType>('/proApi/admin/dashboard/getPaysFormData', params);

export const getUserFormData = (params: GetDataChartsQueryType) =>
  GET<GetUserFormDataResponseType>('/proApi/admin/dashboard/getUserFormData', params);
