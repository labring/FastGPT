import type { getLogKeysQuery, getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';
import type { updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { GET, POST } from '@/web/common/api/request';
import type { AppLogsListItemType } from '@/types/app';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq';
import type {
  getTotalDataQuery,
  getTotalDataResponse
} from '@/pages/api/core/app/logs/getTotalData';
import type {
  getTotalDataV2Query,
  getTotalDataV2Response
} from '@/pages/api/core/app/logs/getTotalDataV2';
import type {
  getChartDataBody,
  getChartDataResponse
} from '@/pages/api/core/app/logs/getChartData';
import type {
  getChartDataV2Body,
  getChartDataV2Response
} from '@/pages/api/core/app/logs/getChartDataV2';

export const updateLogKeys = (data: updateLogKeysBody) =>
  POST('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponse>('/core/app/logs/getLogKeys', data);

export const getAppChatLogs = (data: GetAppChatLogsParams) =>
  POST<PaginationResponse<AppLogsListItemType>>(`/core/app/getChatLogs`, data, { maxQuantity: 1 });

export const getAppTotalData = (data: getTotalDataQuery) =>
  GET<getTotalDataResponse>('/core/app/logs/getTotalData', data);

export const getAppTotalDataV2 = (data: getTotalDataV2Query) =>
  GET<getTotalDataV2Response>('/core/app/logs/getTotalDataV2', data);

export const getAppChartData = (data: getChartDataBody) =>
  POST<getChartDataResponse>('/core/app/logs/getChartData', data);

export const getAppChartDataV2 = (data: getChartDataV2Body) =>
  POST<getChartDataV2Response>('/core/app/logs/getChartDataV2', data);
