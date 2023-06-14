import { ChatItemSimpleType } from '@/types/chat';
import { modelToolMap } from '@/utils/plugin';
import type { ChatModelType } from '@/constants/model';
import { ChatRoleEnum } from '@/constants/chat';
import { OpenAiChatEnum, ClaudeEnum } from '@/constants/model';
import { chatResponse, openAiStreamResponse } from './openai';
import { claudChat, claudStreamResponse } from './claude';
import type { NextApiResponse } from 'next';

export type ChatCompletionType = {
  apiKey: string;
  temperature: number;
  messages: ChatItemSimpleType[];
  chatId?: string;
  [key: string]: any;
};
export type ChatCompletionResponseType = {
  streamResponse: any;
  responseMessages: ChatItemSimpleType[];
  responseText: string;
  totalTokens: number;
};
export type StreamResponseType = {
  chatResponse: any;
  prompts: ChatItemSimpleType[];
  res: NextApiResponse;
  [key: string]: any;
};
export type StreamResponseReturnType = {
  responseContent: string;
  totalTokens: number;
  finishMessages: ChatItemSimpleType[];
};

export const modelServiceToolMap: Record<
  ChatModelType,
  {
    chatCompletion: (data: ChatCompletionType) => Promise<ChatCompletionResponseType>;
    streamResponse: (data: StreamResponseType) => Promise<StreamResponseReturnType>;
  }
> = {
  [OpenAiChatEnum.GPT35]: {
    chatCompletion: (data: ChatCompletionType) =>
      chatResponse({ model: OpenAiChatEnum.GPT35, ...data }),
    streamResponse: (data: StreamResponseType) =>
      openAiStreamResponse({
        model: OpenAiChatEnum.GPT35,
        ...data
      })
  },
  [OpenAiChatEnum.GPT3516k]: {
    chatCompletion: (data: ChatCompletionType) =>
      chatResponse({ model: OpenAiChatEnum.GPT3516k, ...data }),
    streamResponse: (data: StreamResponseType) =>
      openAiStreamResponse({
        model: OpenAiChatEnum.GPT3516k,
        ...data
      })
  },
  [OpenAiChatEnum.GPT4]: {
    chatCompletion: (data: ChatCompletionType) =>
      chatResponse({ model: OpenAiChatEnum.GPT4, ...data }),
    streamResponse: (data: StreamResponseType) =>
      openAiStreamResponse({
        model: OpenAiChatEnum.GPT4,
        ...data
      })
  },
  [OpenAiChatEnum.GPT432k]: {
    chatCompletion: (data: ChatCompletionType) =>
      chatResponse({ model: OpenAiChatEnum.GPT432k, ...data }),
    streamResponse: (data: StreamResponseType) =>
      openAiStreamResponse({
        model: OpenAiChatEnum.GPT432k,
        ...data
      })
  },
  [ClaudeEnum.Claude]: {
    chatCompletion: claudChat,
    streamResponse: claudStreamResponse
  }
};

/* delete invalid symbol */
const simplifyStr = (str: string) =>
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
  model: ChatModelType;
  prompts: ChatItemSimpleType[];
  maxTokens: number;
}) => {
  const systemPrompts: ChatItemSimpleType[] = [];
  const chatPrompts: ChatItemSimpleType[] = [];

  let rawTextLen = 0;
  prompts.forEach((item) => {
    const val = simplifyStr(item.value);
    rawTextLen += val.length;

    const data = {
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
  maxTokens -= modelToolMap[model].countTokens({
    messages: systemPrompts
  });

  // 根据 tokens 截断内容
  const chats: ChatItemSimpleType[] = [];

  // 从后往前截取对话内容
  for (let i = chatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(chatPrompts[i]);

    const tokens = modelToolMap[model].countTokens({
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

/* stream response */
export const resStreamResponse = async ({
  model,
  res,
  chatResponse,
  prompts
}: StreamResponseType & {
  model: ChatModelType;
}) => {
  // 创建响应流
  res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');

  const { responseContent, totalTokens, finishMessages } = await modelServiceToolMap[
    model
  ].streamResponse({
    chatResponse,
    prompts,
    res
  });

  return { responseContent, totalTokens, finishMessages };
};
