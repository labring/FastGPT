import { CHAT_GENERATION_STATUS_BATCH_SIZE } from '@fastgpt/global/core/chat/constants';
import { POST, PUT, DELETE } from '@/web/common/api/request';
import { toChatAuthQueryInput } from '@/web/core/chat/utils';
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

/**
 * 批量刷新会话 lease 状态。滚动加载的列表可能超过接口上限，去重后分批请求并合并结果。
 * 任一批失败向上传递，由调用方保留整轮原状态并重试；空列表不发送请求。
 */
export const getChatHistoryStatus = async (
  data: GetHistoryStatusBodyType
): Promise<GetHistoryStatusResponseType> => {
  const chatIds = [...new Set(data.chatIds)];
  const list: GetHistoryStatusResponseType['list'] = [];
  for (let offset = 0; offset < chatIds.length; offset += CHAT_GENERATION_STATUS_BATCH_SIZE) {
    const result = await POST<GetHistoryStatusResponseType>('/core/chat/history/getHistoryStatus', {
      ...data,
      chatIds: chatIds.slice(offset, offset + CHAT_GENERATION_STATUS_BATCH_SIZE)
    });
    list.push(...result.list);
  }
  return { list };
};

export const postMarkChatRead = (data: MarkChatReadBodyType) =>
  POST<void>('/core/chat/history/markRead', data);

// 修改历史记录: 标题/置顶
export const putChatHistory = (data: UpdateHistoryBodyType) =>
  PUT('/core/chat/history/updateHistory', data);

// delete one history (soft delete)
export const delChatHistoryById = (data: DelChatHistoryType) =>
  DELETE(`/core/chat/history/delHistory`, toChatAuthQueryInput(data));

// clear all histories by chat target
export const delClearChatHistories = (data: ClearChatHistoriesType) =>
  DELETE(`/core/chat/history/clearHistories`, toChatAuthQueryInput(data));

// Log manger
export const batchDeleteChatHistories = (data: ChatBatchDeleteBodyType) =>
  POST<void>(`/core/chat/history/batchDelete`, data);
