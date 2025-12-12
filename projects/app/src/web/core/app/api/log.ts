import { GET, POST } from '@/web/common/api/request';
import type {
  getLogKeysQuery,
  getLogKeysResponseType,
  updateLogKeysBody,
  getAppChatLogsBody,
  getChartDataBody,
  getChartDataResponse,
  getTotalDataQuery,
  getTotalDataResponse,
  getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';

export const updateLogKeys = (data: updateLogKeysBody) =>
  POST('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponseType>('/core/app/logs/getLogKeys', data);

export const getAppChatLogs = (data: getAppChatLogsBody) =>
  POST<getAppChatLogsResponseType>(`/core/app/logs/list`, data, { maxQuantity: 1 });

export const getAppTotalData = (data: getTotalDataQuery) =>
  GET<getTotalDataResponse>('/proApi/core/app/logs/getTotalData', data);

export const getAppChartData = (data: getChartDataBody) =>
  POST<getChartDataResponse>('/proApi/core/app/logs/getChartData', data);
