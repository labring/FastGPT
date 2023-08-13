import { GET, POST, DELETE, PUT } from './request';
import type { ChatHistoryItemType } from '@/types/chat';
import type { InitChatResponse, InitShareChatResponse } from './response/chat';
import { RequestPaging } from '../types/index';
import type { OutLinkSchema } from '@/types/mongoSchema';
import type { ShareChatEditType } from '@/types/app';
import type { Props as UpdateHistoryProps } from '@/pages/api/chat/history/updateChatHistory';

/**
 * Get initial chat content
 */
export const getInitChatSiteInfo = (data: { appId: string; chatId?: string }) =>
  GET<InitChatResponse>(`/chat/init`, data);

/**
 * Get chat history
 */
export const getChatHistory = (data: RequestPaging & { appId?: string }) =>
  POST<ChatHistoryItemType[]>('/chat/history/getHistory', data);

/**
 * Delete a chat history item by ID
 */
export const delChatHistoryById = (chatId: string) => DELETE(`/chat/removeHistory`, { chatId });

/**
 * Clear all history by app ID
 */
export const clearChatHistoryByAppId = (appId: string) => DELETE(`/chat/removeHistory`, { appId });

/**
 * Update history quote status
 */
export const updateHistoryQuote = (params: {
  chatId: string;
  contentId: string;
  quoteId: string;
  sourceText: string;
}) => PUT(`/chat/history/updateHistoryQuote`, params);

/**
 * Delete a conversation
 */
export const delChatRecordByIndex = (data: { chatId: string; contentId: string }) =>
  DELETE(`/chat/delChatRecordByContentId`, data);

/**
 * Modify chat history: title/topping
 */
export const putChatHistory = (data: UpdateHistoryProps) =>
  PUT('/chat/history/updateChatHistory', data);

/**
 * Initialize shared chat
 */
export const initShareChatInfo = (data: { shareId: string }) =>
  GET<InitShareChatResponse>(`/chat/shareChat/init`, data);

/**
 * Create a shared chat
 */
export const createShareChat = (
  data: ShareChatEditType & {
    appId: string;
  }
) => POST<string>(`/chat/shareChat/create`, data);

/**
 * Get shared chat
 */
export const getShareChatList = (appId: string) =>
  GET<OutLinkSchema[]>(`/chat/shareChat/list`, { appId });

/**
 * Delete a shared chat
 */
export const delShareChatById = (id: string) => DELETE(`/chat/shareChat/delete?id=${id}`);
