import type { getLogKeysQuery, getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';
import type { updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import { GET, POST } from '@/web/common/api/request';
import type { AppLogsListItemType } from '@/types/app';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq';

export const updateLogKeys = (data: updateLogKeysBody) =>
  POST('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponse>('/core/app/logs/getLogKeys', data);

export const getAppChatLogs = (data: GetAppChatLogsParams) =>
  POST<PaginationResponse<AppLogsListItemType>>(`/core/app/getChatLogs`, data, { maxQuantity: 1 });
