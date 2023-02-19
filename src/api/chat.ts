import { GET, POST, DELETE } from './request';
import { ChatItemType, ChatSiteType, ChatSiteItemType } from '@/types/chat';

/**
 * 获取一个聊天框的ID
 */
export const getChatSiteId = (modelId: string) => GET<string>(`/chat/generate?modelId=${modelId}`);

/**
 * 获取初始化聊天内容
 */
export const getInitChatSiteInfo = (chatId: string, windowId: string = '') =>
  GET<{
    windowId: string;
    chatSite: ChatSiteType;
    history: ChatItemType[];
  }>(`/chat/init?chatId=${chatId}&windowId=${windowId}`);

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
 * 预发 prompt 进行存储
 */
export const postChatGptPrompt = ({
  prompt,
  windowId,
  chatId
}: {
  prompt: ChatSiteItemType;
  windowId: string;
  chatId: string;
}) =>
  POST<string>(`/chat/preChat`, {
    windowId,
    prompt: {
      obj: prompt.obj,
      value: prompt.value
    },
    chatId
  });
/* 获取 Chat 的 Event 对象，进行持续通信 */
export const getChatGPTSendEvent = (chatId: string, windowId: string) =>
  new EventSource(`/api/chat/chatGpt?chatId=${chatId}&windowId=${windowId}`);

/**
 * 删除最后一句
 */
export const delLastMessage = (windowId?: string) =>
  windowId ? DELETE(`/chat/delLastMessage?windowId=${windowId}`) : null;
