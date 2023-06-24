import { ChatItemType } from '@/types/chat';
import { modelToolMap } from '@/utils/plugin';
import type { ChatModelType } from '@/constants/model';
import { ChatRoleEnum, sseResponseEventEnum } from '@/constants/chat';
import { sseResponse } from '../tools';
import { OpenAiChatEnum } from '@/constants/model';
import { chatResponse, openAiStreamResponse } from './openai';
import type { NextApiResponse } from 'next';
import { textAdaptGptResponse } from '@/utils/adapt';
import { parseStreamChunk } from '@/utils/adapt';

export type ChatCompletionType = {
  apiKey: string;
  temperature: number;
  maxToken?: number;
  messages: ChatItemType[];
  chatId?: string;
  [key: string]: any;
};
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
  [key: string]: any;
};
export type StreamResponseReturnType = {
  responseContent: string;
  totalTokens: number;
  finishMessages: ChatItemType[];
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
  }
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
  model: ChatModelType;
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
  maxTokens -= modelToolMap[model].countTokens({
    messages: systemPrompts
  });

  // 根据 tokens 截断内容
  const chats: ChatItemType[] = [];

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

/* stream response */
export const V2_StreamResponse = async ({
  model,
  res,
  chatResponse,
  prompts
}: StreamResponseType & {
  model: ChatModelType;
}) => {
  let responseContent = '';
  let error: any = null;

  const clientRes = async (data: string) => {
    const { content = '' } = (() => {
      try {
        const json = JSON.parse(data);
        const content: string = json?.choices?.[0].delta.content || '';
        error = json.error;
        responseContent += content;
        return { content };
      } catch (error) {
        return {};
      }
    })();

    if (res.closed || error) return;

    if (data === '[DONE]') {
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: null,
          finish_reason: 'stop'
        })
      });
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: '[DONE]'
      });
    } else {
      sseResponse({
        res,
        event: sseResponseEventEnum.answer,
        data: textAdaptGptResponse({
          text: content
        })
      });
    }
  };

  try {
    for await (const chunk of chatResponse.data as any) {
      if (res.closed) break;
      const parse = parseStreamChunk(chunk);
      parse.forEach((item) => clientRes(item.data));
    }
  } catch (error) {
    console.log('pipe error', error);
  }

  if (error) {
    console.log(error);
    return Promise.reject(error);
  }

  // count tokens
  const finishMessages = prompts.concat({
    obj: ChatRoleEnum.AI,
    value: responseContent
  });

  const totalTokens = modelToolMap[model].countTokens({
    messages: finishMessages
  });

  return {
    responseContent,
    totalTokens,
    finishMessages
  };
};
