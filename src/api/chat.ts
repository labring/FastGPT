import { GET, POST, DELETE } from './request';
import type { HistoryItemType } from '@/types/chat';
import type { InitChatResponse, InitShareChatResponse } from './response/chat';
import { RequestPaging } from '../types/index';
import type { ShareChatSchema } from '@/types/mongoSchema';
import type { ShareChatEditType } from '@/types/model';
import { Obj2Query } from '@/utils/tools';
import { Response as LastChatResultResponseType } from '@/pages/api/openapi/chat/lastChatResult';

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (modelId: '' | string, chatId: '' | string) =>
  GET<InitChatResponse>(`/chat/init?modelId=${modelId}&chatId=${chatId}`);

/**
 * 获取历史记录
 */
export const getChatHistory = (data: RequestPaging) =>
  POST<HistoryItemType[]>('/chat/getHistory', data);

/**
 * 删除一条历史记录
 */
export const delChatHistoryById = (id: string) => GET(`/chat/removeHistory?id=${id}`);

/**
 * get latest chat result by chatId
 */
export const getChatResult = (chatId: string) =>
  GET<LastChatResultResponseType>('/openapi/chat/lastChatResult', { chatId });
/**
 * 删除一句对话
 */
export const delChatRecordByIndex = (chatId: string, contentId: string) =>
  DELETE(`/chat/delChatRecordByContentId?chatId=${chatId}&contentId=${contentId}`);

/**
 * create a shareChat
 */
export const createShareChat = (
  data: ShareChatEditType & {
    modelId: string;
  }
) => POST<string>(`/chat/shareChat/create`, data);

/**
 * get  shareChat
 */
export const getShareChatList = (modelId: string) =>
  GET<ShareChatSchema[]>(`/chat/shareChat/list?modelId=${modelId}`);

/**
 * delete a  shareChat
 */
export const delShareChatById = (id: string) => DELETE(`/chat/shareChat/delete?id=${id}`);

/**
 * 初始化分享聊天
 */
export const initShareChatInfo = (data: { shareId: string; password: string }) =>
  GET<InitShareChatResponse>(`/chat/shareChat/init?${Obj2Query(data)}`);
