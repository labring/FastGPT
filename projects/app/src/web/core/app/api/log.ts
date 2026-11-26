import { GET, POST, PUT } from '@/web/common/api/request';
import type {
  getLogKeysQuery,
  getLogKeysResponseType,
  updateLogKeysBody,
  getChartDataBody,
  getChartDataResponse,
  getTotalDataQuery,
  getTotalDataResponse,
  SearchAppChatLogsBody,
  SearchAppChatLogsResponse,
  GetLogUsersBody,
  GetLogUsersResponse,
  updateLogKeysResponseType
} from '@fastgpt/global/openapi/core/app/log/api';

export const updateLogKeys = (data: updateLogKeysBody) =>
  PUT<updateLogKeysResponseType>('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponseType>('/core/app/logs/getLogKeys', data);

export const searchAppChatLogs = (data: SearchAppChatLogsBody, cancelToken?: AbortController) =>
  POST<SearchAppChatLogsResponse>('/core/app/logs/search', data, { cancelToken });

export const getAppTotalData = (data: getTotalDataQuery) =>
  GET<getTotalDataResponse>('/proApi/core/app/logs/getTotalData', data);

export const getAppChartData = (data: getChartDataBody) =>
  POST<getChartDataResponse>('/proApi/core/app/logs/getChartData', data);

export const getLogUsers = (data: GetLogUsersBody) =>
  POST<GetLogUsersResponse>('/core/app/logs/getUsers', data, { maxQuantity: 1 });
