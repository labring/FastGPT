import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type { ChatHistoryItemType } from '@fastgpt/global/core/chat/type.d';
import type {
  InitChatProps,
  InitChatResponse,
  InitOutLinkChatProps,
  getHistoriesProps
} from '@/global/core/chat/api.d';
import type {
  AdminUpdateFeedbackParams,
  ClearHistoriesProps,
  DelHistoryProps,
  DeleteChatItemProps,
  UpdateHistoryProps
} from '@/global/core/chat/api.d';

/**
 * 获取初始化聊天内容
 */
export const getInitChatInfo = (data: InitChatProps) =>
  GET<InitChatResponse>(`/core/chat/init`, data);
export const getInitOutLinkChatInfo = (data: InitOutLinkChatProps) =>
  GET<InitChatResponse>(`/core/chat/outLink/init`, data);

/**
 * get current window history(appid or shareId)
 */
export const getChatHistories = (data: getHistoriesProps) =>
  POST<ChatHistoryItemType[]>('/core/chat/getHistories', data);

/**
 * delete one history
 */
export const delChatHistoryById = (data: DelHistoryProps) => DELETE(`/core/chat/delHistory`, data);
/**
 * clear all history by appid
 */
export const clearChatHistoryByAppId = (data: ClearHistoriesProps) =>
  DELETE(`/core/chat/clearHistories`, data);

/**
 * delete one chat record
 */
export const delChatRecordById = (data: DeleteChatItemProps) =>
  DELETE(`/core/chat/item/delete`, data);

/**
 * 修改历史记录: 标题/置顶
 */
export const putChatHistory = (data: UpdateHistoryProps) => PUT('/core/chat/updateHistory', data);

export const userUpdateChatFeedback = (data: { chatItemId: string; userFeedback?: string }) =>
  POST('/core/chat/feedback/userUpdate', data);

export const adminUpdateChatFeedback = (data: AdminUpdateFeedbackParams) =>
  POST('/core/chat/feedback/adminUpdate', data);
