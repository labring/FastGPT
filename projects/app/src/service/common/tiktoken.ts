import { ChatItemType } from '@/types/chat';
import { ChatRoleEnum } from '@/constants/chat';
import type { NextApiResponse } from 'next';
import { countMessagesTokens, countPromptTokens } from '@/utils/common/tiktoken';
import { adaptRole_Chat2Message } from '@/utils/common/adapt/message';

export type ChatCompletionResponseType = {
  streamResponse: any;
  responseMessages: ChatItemType[];
  responseText: string;
  totalTokens: number;
};
export type StreamResponseType = {
  chatResponse: any;
  messages: ChatItemType[];
  res: NextApiResponse;
  model: string;
  [key: string]: any;
};

/* slice chat context by tokens */
export function ChatContextFilter({
  messages = [],
  maxTokens
}: {
  messages: ChatItemType[];
  maxTokens: number;
}) {
  if (!Array.isArray(messages)) {
    return [];
  }
  const rawTextLen = messages.reduce((sum, item) => sum + item.value.length, 0);

  // If the text length is less than half of the maximum token, no calculation is required
  if (rawTextLen < maxTokens * 0.5) {
    return messages;
  }

  // filter startWith system prompt
  const chatStartIndex = messages.findIndex((item) => item.obj !== ChatRoleEnum.System);
  const systemPrompts: ChatItemType[] = messages.slice(0, chatStartIndex);
  const chatPrompts: ChatItemType[] = messages.slice(chatStartIndex);

  // reduce token of systemPrompt
  maxTokens -= countMessagesTokens({
    messages: systemPrompts
  });

  // 根据 tokens 截断内容
  const chats: ChatItemType[] = [];

  // 从后往前截取对话内容
  for (let i = chatPrompts.length - 1; i >= 0; i--) {
    const item = chatPrompts[i];
    chats.unshift(item);

    const tokens = countPromptTokens(item.value, adaptRole_Chat2Message(item.obj));
    maxTokens -= tokens;

    /* 整体 tokens 超出范围, system必须保留 */
    if (maxTokens <= 0) {
      chats.shift();
      break;
    }
  }

  return [...systemPrompts, ...chats];
}
