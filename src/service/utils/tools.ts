import type { NextApiRequest } from 'next';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ChatItemType } from '@/types/chat';
import { OpenApi, User } from '../mongo';
import { formatPrice } from '@/utils/user';
import { ERROR_ENUM } from '../errorCode';
import { countChatTokens } from '@/utils/tools';
import { ChatCompletionRequestMessageRoleEnum } from 'openai';
import { ChatModelEnum } from '@/constants/model';

/* 密码加密 */
export const hashPassword = (psw: string) => {
  return crypto.createHash('sha256').update(psw).digest('hex');
};

/* 生成 token */
export const generateToken = (userId: string) => {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
};

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
      return Promise.reject('Insufficient account balance');
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

/* 代理 */
export const httpsAgent = (fast: boolean) =>
  fast ? global.httpsAgentFast : global.httpsAgentNormal;

/* 聊天内容 tokens 截断 */
export const openaiChatFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: `${ChatModelEnum}`;
  prompts: ChatItemType[];
  maxTokens: number;
}) => {
  const formatPrompts = prompts.map((item) => ({
    obj: item.obj,
    value: item.value
      // .replace(/[\u3000\u3001\uff01-\uff5e\u3002]/g, ' ') // 中文标点改空格
      .replace(/\n+/g, '\n') // 连续空行
      .replace(/[^\S\r\n]+/g, ' ') // 连续空白内容
      .trim()
  }));

  let chats: ChatItemType[] = [];
  let systemPrompt: ChatItemType | null = null;

  //  System 词保留
  if (formatPrompts[0]?.obj === 'SYSTEM') {
    systemPrompt = formatPrompts.shift() as ChatItemType;
  }

  // 格式化文本内容成 chatgpt 格式
  const map = {
    Human: ChatCompletionRequestMessageRoleEnum.User,
    AI: ChatCompletionRequestMessageRoleEnum.Assistant,
    SYSTEM: ChatCompletionRequestMessageRoleEnum.System
  };

  let messages: { role: ChatCompletionRequestMessageRoleEnum; content: string }[] = [];

  // 从后往前截取对话内容
  for (let i = formatPrompts.length - 1; i >= 0; i--) {
    chats.unshift(formatPrompts[i]);

    messages = (systemPrompt ? [systemPrompt, ...chats] : chats).map((item) => ({
      role: map[item.obj],
      content: item.value
    }));

    const tokens = countChatTokens({
      model,
      messages
    });

    /* 整体 tokens 超出范围 */
    if (tokens >= maxTokens) {
      break;
    }
  }

  return messages;
};

/* system 内容截断 */
export const systemPromptFilter = ({
  model,
  prompts,
  maxTokens
}: {
  model: 'gpt-4' | 'gpt-4-32k' | 'gpt-3.5-turbo';
  prompts: string[];
  maxTokens: number;
}) => {
  let splitText = '';

  // 从前往前截取
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i].replace(/\n+/g, '\n');

    splitText += `${prompt}\n`;
    const tokens = countChatTokens({ model, messages: [{ role: 'system', content: splitText }] });
    if (tokens >= maxTokens) {
      break;
    }
  }

  return splitText.slice(0, splitText.length - 1).replace(/\n+/g, '\n');
};
