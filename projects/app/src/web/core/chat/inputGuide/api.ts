import { GET, POST, DELETE, PUT } from '@/web/common/api/request';
import type {
  ChatInputGuideProps,
  ChatInputGuideResponse
} from '@/pages/api/core/chat/inputGuide/list';
import type {
  countChatInputGuideTotalQuery,
  countChatInputGuideTotalResponse
} from '@/pages/api/core/chat/inputGuide/countTotal';
import type {
  createInputGuideBody,
  createInputGuideResponse
} from '@/pages/api/core/chat/inputGuide/create';
import type { updateInputGuideBody } from '@/pages/api/core/chat/inputGuide/update';
import type { deleteChatInputGuideQuery } from '@/pages/api/core/chat/inputGuide/delete';
import type {
  QueryChatInputGuideBody,
  QueryChatInputGuideResponse
} from '@/pages/api/core/chat/inputGuide/query';

export const getCountChatInputGuideTotal = (data: countChatInputGuideTotalQuery) =>
  GET<countChatInputGuideTotalResponse>(`/core/chat/inputGuide/countTotal`, data);
/**
 * Get chat input guide list
 */
export const getChatInputGuideList = (data: ChatInputGuideProps) =>
  GET<ChatInputGuideResponse>(`/core/chat/inputGuide/list`, data);

export const queryChatInputGuideList = (data: QueryChatInputGuideBody, url?: string) => {
  if (url) {
    return GET<QueryChatInputGuideResponse>(url, data, {
      withCredentials: !url
    });
  }
  return POST<QueryChatInputGuideResponse>(`/core/chat/inputGuide/query`, data);
};

export const postChatInputGuides = (data: createInputGuideBody) =>
  POST<createInputGuideResponse>(`/core/chat/inputGuide/create`, data);
export const putChatInputGuide = (data: updateInputGuideBody) =>
  PUT(`/core/chat/inputGuide/update`, data);
export const delChatInputGuide = (data: deleteChatInputGuideQuery) =>
  POST(`/core/chat/inputGuide/delete`, data);
