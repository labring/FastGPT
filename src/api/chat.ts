import { GET, POST, DELETE } from './request';
import type { ChatItemType, ChatSiteItemType } from '@/types/chat';
import type { InitChatResponse } from './response/chat';

/**
 * 获取一个聊天框的ID
 */
export const getChatSiteId = (modelId: string, isShare = false) =>
  GET<string>(`/chat/generate?modelId=${modelId}&isShare=${isShare ? 'true' : 'false'}`);

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (chatId: string) =>
  GET<InitChatResponse>(`/chat/init?chatId=${chatId}`);

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
 * 存储一轮对话
 */
export const postSaveChat = (data: { chatId: string; prompts: ChatItemType[] }) =>
  POST('/chat/saveChat', data);

/**
 * 删除一句对话
 */
export const delChatRecordByIndex = (chatId: string, index: number) =>
  DELETE(`/chat/delChatRecordByIndex?chatId=${chatId}&index=${index}`);
