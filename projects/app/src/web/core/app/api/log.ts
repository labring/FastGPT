import type { getLogKeysQuery, getLogKeysResponse } from '@/pages/api/core/app/logs/getLogKeys';
import type { updateLogKeysBody } from '@/pages/api/core/app/logs/updateLogKeys';
import type { GetAppDatasetCollectionParams } from '@/global/core/api/appReq';
import type { GetAppDatasetCollectionResponse } from '@/global/core/api/appRes';
import { GET, POST } from '@/web/common/api/request';
import type { AppLogsListItemType } from '@/types/app';
import type { PaginationResponse } from '@fastgpt/web/common/fetch/type';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq';
import type {
  getChartDataBody,
  getChartDataResponse,
  getTotalDataQuery,
  getTotalDataResponse
} from '@fastgpt/global/core/app/logs/api';
import type {
  DeleteChatCorrectionParams,
  DeleteChatCorrectionResponse,
  GetKeywordQuoteParams,
  GetKeywordQuoteResponse,
  ListChatCorrectionParams,
  ListChatCorrectionResponse,
  SubmitChatCorrectionParams,
  SubmitChatCorrectionResponse
} from '@fastgpt/global/core/chat/correction/api';

export const updateLogKeys = (data: updateLogKeysBody) =>
  POST('/core/app/logs/updateLogKeys', data);

export const getLogKeys = (data: getLogKeysQuery) =>
  GET<getLogKeysResponse>('/core/app/logs/getLogKeys', data);

export const getAppChatLogs = (data: GetAppChatLogsParams) =>
  POST<PaginationResponse<AppLogsListItemType>>(`/core/app/getChatLogs`, data, { maxQuantity: 1 });

export const getAppTotalData = (data: getTotalDataQuery) =>
  GET<getTotalDataResponse>('/proApi/core/app/logs/getTotalData', data);

export const getAppChartData = (data: getChartDataBody) =>
  POST<getChartDataResponse>('/proApi/core/app/logs/getChartData', data);

export const getKeywordQuote = (data: GetKeywordQuoteParams) =>
  POST<GetKeywordQuoteResponse>('/core/chat/quote/getKeywordQuote', data);

export const getChatCorrectionList = (data: ListChatCorrectionParams) =>
  POST<ListChatCorrectionResponse>('/core/chat/correction/list', data);

export const deleteChatCorrection = (data: DeleteChatCorrectionParams) =>
  POST<DeleteChatCorrectionResponse>('/core/chat/correction/delete', data);

export const submitChatCorrection = (data: SubmitChatCorrectionParams) =>
  POST<SubmitChatCorrectionResponse>('/core/chat/correction/submit', data);

export const getAppDatasetCollection = (data: GetAppDatasetCollectionParams) =>
  POST<GetAppDatasetCollectionResponse>(`/core/app/getAppDatasetCollection`, data);
