import type { NextApiRequest } from 'next';
import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import { Chat, Model, OpenApi, User, ShareChat, KB } from '../mongo';
import type { ModelSchema } from '@/types/mongoSchema';
import type { ChatItemSimpleType } from '@/types/chat';
import mongoose from 'mongoose';
import { ClaudeEnum, defaultModel } from '@/constants/model';
import { formatPrice } from '@/utils/user';
import { ERROR_ENUM } from '../errorCode';
import { ChatModelType, OpenAiChatEnum } from '@/constants/model';
import { hashPassword } from '@/service/utils/tools';

/* 校验 token */
export const authToken = (req: NextApiRequest): Promise<string> => {
  return new Promise((resolve, reject) => {
    // 获取 cookie
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.token;

    if (!token) {
      return reject(ERROR_ENUM.unAuthorization);
    }

    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject(ERROR_ENUM.unAuthorization);
        return;
      }
      resolve(decoded.userId);
    });
  });
};

export const getOpenAiKey = () => {
  // 纯字符串类型
  const keys = process.env.OPENAIKEY?.split(',') || [];
  const i = Math.floor(Math.random() * keys.length);
  return keys[i] || (process.env.OPENAIKEY as string);
};

/* 获取 api 请求的 key */
export const getApiKey = async ({
  model,
  userId,
  mustPay = false
}: {
  model: ChatModelType;
  userId: string;
  mustPay?: boolean;
}) => {
  const user = await User.findById(userId);
  if (!user) {
    return Promise.reject(ERROR_ENUM.unAuthorization);
  }

  const keyMap = {
    [OpenAiChatEnum.GPT35]: {
      userOpenAiKey: user.openaiKey || '',
      systemAuthKey: getOpenAiKey() as string
    },
    [OpenAiChatEnum.GPT4]: {
      userOpenAiKey: user.openaiKey || '',
      systemAuthKey: process.env.GPT4KEY as string
    },
    [OpenAiChatEnum.GPT432k]: {
      userOpenAiKey: user.openaiKey || '',
      systemAuthKey: process.env.GPT4KEY as string
    },
    [ClaudeEnum.Claude]: {
      userOpenAiKey: '',
      systemAuthKey: process.env.CLAUDE_KEY as string
    }
  };

  // 有自己的key
  if (!mustPay && keyMap[model].userOpenAiKey) {
    return {
      user,
      userOpenAiKey: keyMap[model].userOpenAiKey,
      systemAuthKey: ''
    };
  }

  // 平台账号余额校验
  if (formatPrice(user.balance) <= 0) {
    return Promise.reject(ERROR_ENUM.insufficientQuota);
  }

  return {
    user,
    userOpenAiKey: '',
    systemAuthKey: keyMap[model].systemAuthKey
  };
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
  if (authOwner || (authUser && !model.share.isShare)) {
    if (userId !== String(model.userId)) return Promise.reject(ERROR_ENUM.unAuthModel);
  }

  // do not share detail info
  if (!reserveDetail && !model.share.isShareDetail && userId !== String(model.userId)) {
    model.chat = {
      ...defaultModel.chat,
      chatModel: model.chat.chatModel
    };
  }

  return { model, showModelDetail: model.share.isShareDetail || userId === String(model.userId) };
};

// 知识库操作权限
export const authKb = async ({ kbId, userId }: { kbId: string; userId: string }) => {
  const kb = await KB.findOne({
    _id: kbId,
    userId
  });
  if (kb) {
    return kb;
  }
  return Promise.reject(ERROR_ENUM.unAuthKb);
};

// 获取对话校验
export const authChat = async ({
  modelId,
  chatId,
  req
}: {
  modelId: string;
  chatId: '' | string;
  req: NextApiRequest;
}) => {
  const userId = await authToken(req);

  // 获取 model 数据
  const { model, showModelDetail } = await authModel({
    modelId,
    userId,
    authOwner: false,
    reserveDetail: true
  });

  // 聊天内容
  let content: ChatItemSimpleType[] = [];

  if (chatId) {
    // 获取 chat 数据
    content = await Chat.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(chatId) } },
      {
        $project: {
          content: {
            $slice: ['$content', -50] // 返回 content 数组的最后50个元素
          }
        }
      },
      { $unwind: '$content' },
      {
        $project: {
          obj: '$content.obj',
          value: '$content.value'
        }
      }
    ]);
  }
  // 获取 user 的 apiKey
  const { userOpenAiKey, systemAuthKey } = await getApiKey({ model: model.chat.chatModel, userId });

  return {
    userOpenAiKey,
    systemAuthKey,
    content,
    userId,
    model,
    showModelDetail
  };
};
export const authShareChat = async ({
  shareId,
  password
}: {
  shareId: string;
  password: string;
}) => {
  // get shareChat
  const shareChat = await ShareChat.findById(shareId);

  if (!shareChat) {
    return Promise.reject('分享链接已失效');
  }

  if (shareChat.password !== hashPassword(password)) {
    return Promise.reject({
      code: 501,
      message: '密码不正确'
    });
  }

  const modelId = String(shareChat.modelId);
  const userId = String(shareChat.userId);

  // 获取 model 数据
  const { model, showModelDetail } = await authModel({
    modelId,
    userId
  });

  // 获取 user 的 apiKey
  const { userOpenAiKey, systemAuthKey } = await getApiKey({
    model: model.chat.chatModel,
    userId
  });

  return {
    userOpenAiKey,
    systemAuthKey,
    userId,
    model,
    showModelDetail
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

    // 更新使用的时间
    await OpenApi.findByIdAndUpdate(openApi._id, {
      lastUsedTime: new Date()
    });

    return {
      userId
    };
  } catch (error) {
    return Promise.reject(error);
  }
};
