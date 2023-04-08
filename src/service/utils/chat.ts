import { Configuration, OpenAIApi } from 'openai';
import { Chat } from '../mongo';
import type { ChatPopulate } from '@/types/mongoSchema';
import { authToken } from './tools';
import { getOpenApiKey } from './openai';

export const getOpenAIApi = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey
  });

  return new OpenAIApi(configuration, undefined);
};

export const authChat = async (chatId: string, authorization?: string) => {
  // 获取 chat 数据
  const chat = await Chat.findById<ChatPopulate>(chatId).populate({
    path: 'modelId',
    options: {
      strictPopulate: false
    }
  });

  if (!chat || !chat.modelId || !chat.userId) {
    return Promise.reject('模型不存在');
  }

  // 凭证校验
  const userId = await authToken(authorization);
  if (userId !== String(chat.userId._id)) {
    return Promise.reject('无权使用该对话');
  }

  // 获取 user 的 apiKey
  const { user, userApiKey, systemKey } = await getOpenApiKey(chat.userId as unknown as string);

  // filter 掉被 deleted 的内容
  chat.content = chat.content.filter((item) => item.deleted !== true);

  return {
    userApiKey,
    systemKey,
    chat,
    userId: user._id
  };
};
