import { POST, PUT, DELETE } from '@/web/common/api/request';
import type {
  ChatBatchDeleteBodyType,
  DelChatHistoryType,
  ClearChatHistoriesType,
  GetHistoriesBodyType,
  GetHistoriesResponseType,
  GetHistoryStatusBodyType,
  GetHistoryStatusResponseType,
  MarkChatReadBodyType,
  UpdateHistoryBodyType
} from '@fastgpt/global/openapi/core/chat/history/api';

export const getChatHistories = (data: GetHistoriesBodyType) =>
  POST<GetHistoriesResponseType>('/core/chat/history/getHistories', data);

export const getChatHistoryStatus = (data: GetHistoryStatusBodyType) =>
  POST<GetHistoryStatusResponseType>('/core/chat/history/getHistoryStatus', data);

export const postMarkChatRead = (data: MarkChatReadBodyType) =>
  POST<void>('/core/chat/history/markRead', data);

// 修改历史记录: 标题/置顶
export const putChatHistory = (data: UpdateHistoryBodyType) =>
  PUT('/core/chat/history/updateHistory', data);

// delete one history (soft delete)
export const delChatHistoryById = (data: DelChatHistoryType) =>
  DELETE(`/core/chat/history/delHistory`, data);

// clear all history by appId
export const delClearChatHistories = (data: ClearChatHistoriesType) =>
  DELETE(`/core/chat/history/clearHistories`, data);

// Log manger
export const batchDeleteChatHistories = (data: ChatBatchDeleteBodyType) =>
  POST<void>(`/core/chat/history/batchDelete`, data);
