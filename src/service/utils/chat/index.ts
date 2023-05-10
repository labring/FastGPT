import { ChatItemSimpleType } from '@/types/chat';
import { modelToolMap } from '@/utils/chat';
import type { ChatModelType } from '@/constants/model';
import { ChatRoleEnum, SYSTEM_PROMPT_HEADER } from '@/constants/chat';
import { OpenAiChatEnum, ClaudeEnum } from '@/constants/model';
import { chatResponse, openAiStreamResponse } from './openai';
import { lafClaudChat, lafClaudStreamResponse } from './claude';
import type { NextApiResponse } from 'next';
import type { PassThrough } from 'stream';

export type ChatCompletionType = {
  apiKey: string;
  temperature: number;
  messages: ChatItemSimpleType[];
  stream: boolean;
  [key: string]: any;
};
export type ChatCompletionResponseType = {
  streamResponse: any;
  responseMessages: ChatItemSimpleType[];
  responseText: string;
  totalTokens: number;
};
export type StreamResponseType = {
  stream: PassThrough;
  chatResponse: any;
  prompts: ChatItemSimpleType[];
  res: NextApiResponse;
  systemPrompt?: string;
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
    chatCompletion: lafClaudChat,
    streamResponse: lafClaudStreamResponse
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
  let rawTextLen = 0;
  const formatPrompts = prompts.map<ChatItemSimpleType>((item) => {
    const val = simplifyStr(item.value);
    rawTextLen += val.length;
    return {
      obj: item.obj,
      value: val
    };
  });

  // 长度太小时，不需要进行 token 截断
  if (formatPrompts.length <= 2 || rawTextLen < maxTokens * 0.5) {
    return formatPrompts;
  }

  // 根据 tokens 截断内容
  const chats: ChatItemSimpleType[] = [];

  // 从后往前截取对话内容
  for (let i = formatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(formatPrompts[i]);

    const tokens = modelToolMap[model].countTokens({
      messages: chats
    });

    /* 整体 tokens 超出范围, system必须保留 */
    if (tokens >= maxTokens && formatPrompts[i].obj !== ChatRoleEnum.System) {
      return chats.slice(1);
    }
  }

  return chats;
};

/* stream response */
export const resStreamResponse = async ({
  model,
  res,
  stream,
  chatResponse,
  systemPrompt,
  prompts
}: StreamResponseType & {
  model: ChatModelType;
}) => {
  // 创建响应流
  res.setHeader('Content-Type', 'text/event-stream;charset-utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  systemPrompt && res.setHeader(SYSTEM_PROMPT_HEADER, encodeURIComponent(systemPrompt));
  stream.pipe(res);

  const { responseContent, totalTokens, finishMessages } = await modelServiceToolMap[
    model
  ].streamResponse({
    chatResponse,
    stream,
    prompts,
    res,
    systemPrompt
  });

  // close stream
  !stream.destroyed && stream.push(null);
  stream.destroy();

  return { responseContent, totalTokens, finishMessages };
};
