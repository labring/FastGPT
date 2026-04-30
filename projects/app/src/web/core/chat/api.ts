import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { InitOutLinkChatQueryType } from '@fastgpt/global/openapi/core/chat/outLink/api';
import type { ChatSettingModelType, ChatSettingType } from '@fastgpt/global/core/chat/setting/type';
import type {
  GetChatFavouriteListParamsType,
  UpdateFavouriteAppParamsType
} from '@fastgpt/global/openapi/core/chat/favourite/api';
import type { ChatFavouriteAppType } from '@fastgpt/global/core/chat/favouriteApp/type';
import type {
  InitChatQueryType,
  InitChatResponseType,
  InitTeamChatQueryType,
  StopV2ChatParams
} from '@fastgpt/global/openapi/core/chat/controler/api';
import type { GetRecentlyUsedAppsResponseType } from '@fastgpt/global/openapi/core/chat/api';

export const getRecentlyUsedApps = () =>
  GET<GetRecentlyUsedAppsResponseType>('/core/chat/recentlyUsed', undefined, { maxQuantity: 1 });

/**
 * 获取初始化聊天内容
 */
export const getInitChatInfo = (data: InitChatQueryType) =>
  GET<InitChatResponseType>(`/core/chat/init`, data);
export const getInitOutLinkChatInfo = (data: InitOutLinkChatQueryType) =>
  GET<InitChatResponseType>(`/core/chat/outLink/init`, data);
export const getTeamChatInfo = (data: InitTeamChatQueryType) =>
  GET<InitChatResponseType>(`/core/chat/team/init`, data);

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
