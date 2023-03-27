import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import tunnel from 'tunnel';
import type { UserModelSchema } from '@/types/mongoSchema';
import { formatPrice } from '@/utils/user';
import { ChatItemType } from '@/types/chat';
import { encode } from 'gpt-token-utils';

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

/* 获取用户的 openai APIkey */
export const getUserOpenaiKey = async (userId: string) => {
  const user = await User.findById(userId);

  const userApiKey = user?.accounts?.find((item: any) => item.type === 'openai')?.value;
  if (!userApiKey) {
    return Promise.reject('缺少ApiKey, 无法请求');
  }

  return Promise.resolve(userApiKey as string);
};

/* 获取key，如果没有就用平台的，用平台记得加账单 */
export const getOpenApiKey = async (userId: string) => {
  const user = await User.findById<UserModelSchema>(userId);

  if (!user) return Promise.reject('用户不存在');

  const userApiKey = user.accounts?.find((item: any) => item.type === 'openai')?.value;

  // 有自己的key， 直接使用
  if (userApiKey) {
    return {
      userApiKey: await getUserOpenaiKey(userId),
      systemKey: ''
    };
  }

  // 余额校验
  if (formatPrice(user.balance) <= 0) {
    return Promise.reject('该账号余额不足');
  }

  return {
    userApiKey: '',
    systemKey: process.env.OPENAIKEY as string
  };
};

/* 代理 */
export const httpsAgent =
  process.env.AXIOS_PROXY_HOST && process.env.AXIOS_PROXY_PORT
    ? tunnel.httpsOverHttp({
        proxy: {
          host: process.env.AXIOS_PROXY_HOST,
          port: +process.env.AXIOS_PROXY_PORT
        }
      })
    : undefined;

/* tokens 截断 */
export const openaiChatFilter = (prompts: ChatItemType[], maxTokens: number) => {
  let res: ChatItemType[] = [];

  let systemPrompt: ChatItemType | null = null;

  //  System 词保留
  if (prompts[0]?.obj === 'SYSTEM') {
    systemPrompt = prompts.shift() as ChatItemType;
    maxTokens -= encode(prompts[0].value).length;
  }

  // 从后往前截取
  for (let i = prompts.length - 1; i >= 0; i--) {
    const tokens = encode(prompts[i].value).length;
    if (maxTokens >= tokens) {
      res.unshift(prompts[i]);
      maxTokens -= tokens;
    } else {
      break;
    }
  }

  return systemPrompt ? [systemPrompt, ...res] : res;
};
