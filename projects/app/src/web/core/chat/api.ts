import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type.d';
import type { getResDataQuery } from '@/pages/api/core/chat/getResData';
import type {
  InitChatProps,
  InitChatResponse,
  InitOutLinkChatProps,
  InitTeamChatProps
} from '@/global/core/chat/api.d';

import type { DeleteChatItemProps } from '@/global/core/chat/api.d';
import type {
  getChatRecordsBody,
  getChatRecordsResponse
} from '@/pages/api/core/chat/getRecords_v2';
import type { GetQuoteProps, GetQuotesRes } from '@/pages/api/core/chat/quote/getQuote';
import type {
  GetCollectionQuoteProps,
  GetCollectionQuoteRes
} from '@/pages/api/core/chat/quote/getCollectionQuote';
import type { ChatSettingModelType, ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import type {
  GetChatFavouriteListParamsType,
  UpdateFavouriteAppParamsType
} from '@fastgpt/global/openapi/core/chat/favourite/api';
import type { ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
import type { StopV2ChatParams } from '@fastgpt/global/openapi/core/chat/controler/api';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';

export const getRecentlyUsedApps = () =>
  GET<GetRecentlyUsedAppsResponseType>('/core/chat/recentlyUsed', undefined, { maxQuantity: 1 });

/**
 * 获取初始化聊天内容
 */
export const getInitChatInfo = (data: InitChatProps) =>
  GET<InitChatResponse>(`/core/chat/init`, data);
export const getInitOutLinkChatInfo = (data: InitOutLinkChatProps) =>
  GET<InitChatResponse>(`/core/chat/outLink/init`, data);
export const getTeamChatInfo = (data: InitTeamChatProps) =>
  GET<InitChatResponse>(`/core/chat/team/init`, data);

/**
 * get detail responseData by dataId appId chatId
 */
export const getChatResData = (data: getResDataQuery) =>
  GET<ChatHistoryItemResType[]>(`/core/chat/getResData`, data);

export const getChatRecords = (data: getChatRecordsBody) =>
  POST<getChatRecordsResponse>('/core/chat/getRecords_v2', data);

/**
 * delete one chat record
 */
export const delChatRecordById = (data: DeleteChatItemProps) =>
  POST(`/core/chat/item/delete`, data);

export const getQuoteDataList = (data: GetQuoteProps) =>
  POST<GetQuotesRes>(`/core/chat/quote/getQuote`, data);

export const getCollectionQuote = (data: GetCollectionQuoteProps) =>
  POST<GetCollectionQuoteRes>(`/core/chat/quote/getCollectionQuote`, data);

/*---------- chat setting ------------*/
export const getChatSetting = () => GET<ChatSettingType>('/proApi/core/chat/setting/detail');

export const updateChatSetting = (data: Partial<ChatSettingModelType>) =>
  POST<Partial<ChatSettingType>>('/proApi/core/chat/setting/update', data);

export const getFavouriteApps = (data?: GetChatFavouriteListParamsType) =>
  GET<ChatFavouriteAppType[]>('/proApi/core/chat/setting/favourite/list', data);

export const updateFavouriteApps = (data: UpdateFavouriteAppParamsType[]) =>
  POST<ChatFavouriteAppType[]>('/proApi/core/chat/setting/favourite/update', data);

export const updateFavouriteAppOrder = (data: { id: string; order: number }[]) =>
  PUT<null>('/proApi/core/chat/setting/favourite/order', data);

export const updateFavouriteAppTags = (data: { id: string; tags: string[] }[]) =>
  PUT<null>('/proApi/core/chat/setting/favourite/tags', data);

export const deleteFavouriteApp = (data: { id: string }) =>
  DELETE<null>('/proApi/core/chat/setting/favourite/delete', data);

/* Chat controller */
export const postStopV2Chat = (data: StopV2ChatParams) => POST('/v2/chat/stop', data);
