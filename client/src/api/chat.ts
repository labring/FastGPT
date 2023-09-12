import { GET, POST, DELETE, PUT } from './request';
import type { ChatHistoryItemType } from '@/types/chat';
import type { InitChatResponse } from './response/chat';
import { RequestPaging } from '../types/index';
import type { Props as UpdateHistoryProps } from '@/pages/api/chat/history/updateChatHistory';
import { AdminUpdateFeedbackParams } from './request/chat';

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (data: { appId: string; chatId?: string }) =>
  GET<InitChatResponse>(`/chat/init`, data);

/**
 * 获取历史记录
 */
export const getChatHistory = (data: RequestPaging & { appId?: string }) =>
  POST<ChatHistoryItemType[]>('/chat/history/getHistory', data);

/**
 * 删除一条历史记录
 */
export const delChatHistoryById = (chatId: string) => DELETE(`/chat/removeHistory`, { chatId });
/**
 * clear all history by appid
 */
export const clearChatHistoryByAppId = (appId: string) => DELETE(`/chat/removeHistory`, { appId });

/**
 * 删除一句对话
 */
export const delChatRecordById = (data: { chatId: string; contentId: string }) =>
  DELETE(`/chat/delChatRecordByContentId`, data);

/**
 * 修改历史记录: 标题/置顶
 */
export const putChatHistory = (data: UpdateHistoryProps) =>
  PUT('/chat/history/updateChatHistory', data);

export const userUpdateChatFeedback = (data: { chatItemId: string; userFeedback?: string }) =>
  POST('/chat/feedback/userUpdate', data);

export const adminUpdateChatFeedback = (data: AdminUpdateFeedbackParams) =>
  POST('/chat/feedback/adminUpdate', data);
