import { ChatItemType } from '@/types/chat';
import { modelToolMap } from '@/utils/plugin';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { sseResponse } from '../tools';
import { OpenAiChatEnum } from '@/constants/model';
import type { NextApiResponse } from 'next';

export type ChatCompletionResponseType = {
  streamResponse: any;
  responseMessages: ChatItemType[];
  responseText: string;
  totalTokens: number;
};
export type StreamResponseType = {
  chatResponse: any;
  prompts: ChatItemType[];
  res: NextApiResponse;
  model: `${OpenAiChatEnum}`;
  [key: string]: any;
};
export type StreamResponseReturnType = {
  responseContent: string;
  totalTokens: number;
  finishMessages: ChatItemType[];
};

/* delete invalid symbol */
const simplifyStr = (str = '') =>
  str
    .replace(/\n+/g, '\n') // 连续空行
    .replace(/[^\S\r\n]+/g, ' ') // 连续空白内容
    .trim();

/* 聊天上下文 tokens 截断 */
export const ChatContextFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: string;
  prompts: ChatItemType[];
  maxTokens: number;
}) => {
  const systemPrompts: ChatItemType[] = [];
  const chatPrompts: ChatItemType[] = [];

  let rawTextLen = 0;
  prompts.forEach((item) => {
    const val = simplifyStr(item.value);
    rawTextLen += val.length;

    const data = {
      _id: item._id,
      obj: item.obj,
      value: val
    };

    if (item.obj === ChatRoleEnum.System) {
      systemPrompts.push(data);
    } else {
      chatPrompts.push(data);
    }
  });

  // 长度太小时，不需要进行 token 截断
  if (rawTextLen < maxTokens * 0.5) {
    return [...systemPrompts, ...chatPrompts];
  }

  // 去掉 system 的 token
  maxTokens -= modelToolMap.countTokens({
    model,
    messages: systemPrompts
  });

  // 根据 tokens 截断内容
  const chats: ChatItemType[] = [];

  // 从后往前截取对话内容
  for (let i = chatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(chatPrompts[i]);

    const tokens = modelToolMap.countTokens({
      model,
      messages: chats
    });

    /* 整体 tokens 超出范围, system必须保留 */
    if (tokens >= maxTokens) {
      chats.shift();
      break;
    }
  }

  return [...systemPrompts, ...chats];
};
