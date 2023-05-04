import { GET, POST, DELETE } from './request';
import type { ChatItemType } from '@/types/chat';
import type { InitChatResponse } from './response/chat';

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (modelId: string, chatId: '' | string) =>
  GET<InitChatResponse>(`/chat/init?modelId=${modelId}&chatId=${chatId}`);

/**
 * 获取历史记录
 */
export const getChatHistory = () =>
  GET<{ _id: string; title: string; modelId: string }[]>('/chat/getHistory');

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
  prompts: ChatItemType[];
}) => POST<string>('/chat/saveChat', data);

/**
 * 删除一句对话
 */
export const delChatRecordByIndex = (chatId: string, contentId: string) =>
  DELETE(`/chat/delChatRecordByContentId?chatId=${chatId}&contentId=${contentId}`);
