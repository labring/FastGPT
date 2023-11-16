import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import type { InitChatResponse } from '@fastgpt/global/core/chat/api.d';
import type { RequestPaging } from '@/types';
import { UpdateHistoryProps } from '@fastgpt/global/core/chat/api.d';
import type { AdminUpdateFeedbackParams } from '@fastgpt/global/core/chat/api.d';
import { GetChatSpeechProps } from '@/global/core/chat/api.d';

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (data: { appId: string; chatId?: string }) =>
  GET<InitChatResponse>(`/core/chat/init`, data);

/**
 * 获取历史记录
 */
export const getChatHistory = (data: RequestPaging & { appId: string }) =>
  POST<ChatHistoryItemType[]>('/core/chat/list', data);

/**
 * 删除一条历史记录
 */
export const delChatHistoryById = (chatId: string) => DELETE(`/core/chat/delete`, { chatId });
/**
 * clear all history by appid
 */
export const clearChatHistoryByAppId = (appId: string) => DELETE(`/core/chat/delete`, { appId });

/**
 * 删除一句对话
 */
export const delChatRecordById = (data: { chatId: string; contentId: string }) =>
  DELETE(`/core/chat/item/delete`, data);

/**
 * 修改历史记录: 标题/置顶
 */
export const putChatHistory = (data: UpdateHistoryProps) => PUT('/core/chat/update', data);

export const userUpdateChatFeedback = (data: { chatItemId: string; userFeedback?: string }) =>
  POST('/core/chat/feedback/userUpdate', data);

export const adminUpdateChatFeedback = (data: AdminUpdateFeedbackParams) =>
  POST('/core/chat/feedback/adminUpdate', data);
