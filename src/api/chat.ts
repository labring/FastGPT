import { GET, POST, DELETE } from './request';
import type { ChatItemType, HistoryItemType } from '@/types/chat';
import type { InitChatResponse } from './response/chat';
import { RequestPaging } from '../types/index';

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
 * 存储一轮对话
 */
export const postSaveChat = (data: {
  modelId: string;
  newChatId: '' | string;
  chatId: '' | string;
  prompts: [ChatItemType, ChatItemType];
}) => POST<string>('/chat/saveChat', data);

/**
 * 删除一句对话
 */
export const delChatRecordByIndex = (chatId: string, contentId: string) =>
  DELETE(`/chat/delChatRecordByContentId?chatId=${chatId}&contentId=${contentId}`);
