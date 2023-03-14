import { Configuration, OpenAIApi } from 'openai';
import { Chat } from '../mongo';

export const getOpenAIApi = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey
  });

  return new OpenAIApi(configuration, undefined);
};

export const authChat = async (chatId: string) => {
  // 获取 chat 数据
  const chat = await Chat.findById(chatId)
    .populate({
      path: 'modelId',
      options: {
        strictPopulate: false
      }
    })
    .populate({
      path: 'userId',
      options: {
        strictPopulate: false
      }
    });

  if (!chat || !chat.modelId || !chat.userId) {
    return Promise.reject('聊天已过期');
  }

  // 获取 user 的 apiKey
  const user = chat.userId;

  const userApiKey = user.accounts?.find((item: any) => item.type === 'openai')?.value;

  if (!userApiKey) {
    return Promise.reject('缺少ApiKey, 无法请求');
  }

  return {
    userApiKey,
    chat
  };
};
