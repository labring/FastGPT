import { ChatItemType } from '../types/chat';

export const chatWindows = new Map<string, ChatItemType[]>();

/**
 * 获取聊天窗口信息
 */
export const getWindowMessages = (id: string) => {
  return chatWindows.get(id) || [];
};

export const pushWindowMessage = (id: string, prompt: ChatItemType) => {
  const messages = chatWindows.get(id) || [];
  messages.push(prompt);
  chatWindows.set(id, messages);
  return messages;
};

export const deleteWindow = (id: string) => {
  chatWindows.delete(id);
};
