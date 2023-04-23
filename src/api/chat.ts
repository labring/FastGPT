import { GET, POST, DELETE } from './request';
import type { ChatItemType, ChatSiteItemType } from '@/types/chat';
import type { InitChatResponse } from './response/chat';

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (modelId: string, chatId: '' | string) =>
  GET<InitChatResponse>(`/chat/init?modelId=${modelId}&chatId=${chatId}`);

/**
 * 发送 GPT3 prompt
 */
export const postGPT3SendPrompt = ({
  chatId,
  prompt
}: {
  prompt: ChatSiteItemType[];
  chatId: string;
}) =>
  POST<string>(`/chat/gpt3`, {
    chatId,
    prompt: prompt.map((item) => ({
      obj: item.obj,
      value: item.value
    }))
  });

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
  chatId: '' | string;
  prompts: ChatItemType[];
}) => POST<string>('/chat/saveChat', data);

/**
 * 删除一句对话
 */
export const delChatRecordByIndex = (chatId: string, index: number) =>
  DELETE(`/chat/delChatRecordByIndex?chatId=${chatId}&index=${index}`);
