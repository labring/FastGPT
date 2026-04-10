import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type {
  ChatInputGuideListBodyType,
  ChatInputGuideListResponseType,
  CountChatInputGuideTotalQueryType,
  CountChatInputGuideTotalResponseType,
  CreateChatInputGuideBodyType,
  CreateChatInputGuideResponseType,
  UpdateChatInputGuideBodyType,
  DeleteChatInputGuideBodyType,
  QueryChatInputGuideBodyType,
  QueryChatInputGuideResponseType,
  DeleteAllChatInputGuideBodyType
} from '@fastgpt/global/openapi/core/chat/inputGuide/api';

export const getCountChatInputGuideTotal = (data: CountChatInputGuideTotalQueryType) =>
  GET<CountChatInputGuideTotalResponseType>(`/core/chat/inputGuide/countTotal`, data);
/**
 * Get chat input guide list
 */
export const getChatInputGuideList = (data: ChatInputGuideListBodyType) =>
  POST<ChatInputGuideListResponseType>(`/core/chat/inputGuide/list`, data);

export const queryChatInputGuideList = (data: QueryChatInputGuideBodyType, url?: string) => {
  if (url) {
    return GET<QueryChatInputGuideResponseType>(url, data, {
      withCredentials: !url
    });
  }
  return POST<QueryChatInputGuideResponseType>(`/core/chat/inputGuide/query`, data, {
    maxQuantity: 1
  });
};

export const postChatInputGuides = (data: CreateChatInputGuideBodyType) =>
  POST<CreateChatInputGuideResponseType>(`/core/chat/inputGuide/create`, data);
export const putChatInputGuide = (data: UpdateChatInputGuideBodyType) =>
  PUT(`/core/chat/inputGuide/update`, data);
export const delChatInputGuide = (data: DeleteChatInputGuideBodyType) =>
  POST(`/core/chat/inputGuide/delete`, data);
export const delAllChatInputGuide = (data: DeleteAllChatInputGuideBodyType) =>
  POST(`/core/chat/inputGuide/deleteAll`, data);
