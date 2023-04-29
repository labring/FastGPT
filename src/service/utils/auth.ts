import { Configuration, OpenAIApi } from 'openai';
import type { NextApiRequest } from 'next';
import jwt from 'jsonwebtoken';
import { Chat, Model, OpenApi, User } from '../mongo';
import type { ModelSchema } from '@/types/mongoSchema';
import { getOpenApiKey } from './openai';
import type { ChatItemType } from '@/types/chat';
import mongoose from 'mongoose';
import { defaultModel } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import { ERROR_ENUM } from '../errorCode';

/* 校验 token */
export const authToken = (token?: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (!token) {
      reject('缺少登录凭证');
      return;
    }
    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject('凭证无效');
        return;
      }
      resolve(decoded.userId);
    });
  });
};

export const getOpenAIApi = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey,
    basePath: process.env.OPENAI_BASE_URL
  });

  return new OpenAIApi(configuration);
};

// 模型使用权校验
export const authModel = async ({
  modelId,
  userId,
  authUser = true,
  authOwner = true,
  reserveDetail = false
}: {
  modelId: string;
  userId: string;
  authUser?: boolean;
  authOwner?: boolean;
  reserveDetail?: boolean; // focus reserve detail
}) => {
  // 获取 model 数据
  const model = await Model.findById<ModelSchema>(modelId);
  if (!model) {
    return Promise.reject('模型不存在');
  }

  /* 
    Access verification
    1. authOwner=true or authUser = true ,  just owner can use
    2. authUser = false and share, anyone can use
  */
  if ((authOwner || (authUser && !model.share.isShare)) && userId !== String(model.userId)) {
    return Promise.reject('无权操作该模型');
  }

  // do not share detail info
  if (!reserveDetail && !model.share.isShareDetail && userId !== String(model.userId)) {
    model.chat = {
      ...defaultModel.chat,
      chatModel: model.chat.chatModel
    };
  }

  return { model };
};

// 获取对话校验
export const authChat = async ({
  modelId,
  chatId,
  authorization
}: {
  modelId: string;
  chatId: '' | string;
  authorization?: string;
}) => {
  const userId = await authToken(authorization);

  // 获取 model 数据
  const { model } = await authModel({ modelId, userId, authOwner: false, reserveDetail: true });

  // 聊天内容
  let content: ChatItemType[] = [];

  if (chatId) {
    // 获取 chat 数据
    content = await Chat.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(chatId) } },
      { $unwind: '$content' },
      { $match: { 'content.deleted': false } },
      {
        $project: {
          obj: '$content.obj',
          value: '$content.value'
        }
      }
    ]);
  }

  // 获取 user 的 apiKey
  const { userApiKey, systemKey } = await getOpenApiKey(userId);

  return {
    userApiKey,
    systemKey,
    content,
    userId,
    model
  };
};

/* 校验 open api key */
export const authOpenApiKey = async (req: NextApiRequest) => {
  const { apikey: apiKey } = req.headers;

  if (!apiKey) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  try {
    const openApi = await OpenApi.findOne({ apiKey });
    if (!openApi) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    const userId = String(openApi.userId);

    // 余额校验
    const user = await User.findById(userId);
    if (!user) {
      return Promise.reject(ERROR_ENUM.unAuthorization);
    }
    if (formatPrice(user.balance) <= 0) {
      return Promise.reject(ERROR_ENUM.insufficientQuota);
    }

    // 更新使用的时间
    await OpenApi.findByIdAndUpdate(openApi._id, {
      lastUsedTime: new Date()
    });

    return {
      apiKey: process.env.OPENAIKEY as string,
      userId
    };
  } catch (error) {
    return Promise.reject(error);
  }
};
