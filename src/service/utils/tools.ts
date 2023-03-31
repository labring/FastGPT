import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../models/user';
import tunnel from 'tunnel';
import { formatPrice } from '@/utils/user';
import { ChatItemType } from '@/types/chat';
import { encode } from 'gpt-token-utils';
import { getOpenAIApi } from '@/service/utils/chat';
import axios from 'axios';

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

/* 判断 apikey 是否还有余额 */
export const checkKeyGrant = async (apiKey: string) => {
  const grant = await axios.get('https://api.openai.com/dashboard/billing/credit_grants', {
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    httpsAgent
  });
  if (grant.data?.total_available <= 0.2) {
    return false;
  }
  return true;
};

/* 获取用户 api 的 openai 信息 */
export const getUserApiOpenai = async (userId: string) => {
  const user = await User.findById(userId);

  const userApiKey = user?.accounts?.find((item: any) => item.type === 'openai')?.value;

  if (!userApiKey) {
    return Promise.reject('缺少ApiKey, 无法请求');
  }

  // 余额校验
  const hasGrant = await checkKeyGrant(userApiKey);
  if (!hasGrant) {
    return Promise.reject({
      code: 501,
      message: 'API 余额不足'
    });
  }

  return {
    user,
    openai: getOpenAIApi(userApiKey),
    apiKey: userApiKey
  };
};

/* 获取 open api key，如果用户没有自己的key，就用平台的，用平台记得加账单 */
export const getOpenApiKey = async (userId: string, checkGrant = false) => {
  const user = await User.findById(userId);
  if (!user) {
    return Promise.reject('找不到用户');
  }

  const userApiKey = user?.accounts?.find((item: any) => item.type === 'openai')?.value;

  // 有自己的key
  if (userApiKey) {
    // api 余额校验
    if (checkGrant) {
      const hasGrant = await checkKeyGrant(userApiKey);
      if (!hasGrant) {
        return Promise.reject({
          code: 501,
          message: 'API 余额不足'
        });
      }
    }

    return {
      user,
      userApiKey,
      systemKey: ''
    };
  }

  // 平台账号余额校验
  if (formatPrice(user.balance) <= 0) {
    return Promise.reject({
      code: 501,
      message: '账号余额不足'
    });
  }

  return {
    user,
    userApiKey: '',
    systemKey: process.env.OPENAIKEY as string
  };
};

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

/* system 内容截断 */
export const systemPromptFilter = (prompts: string[], maxTokens: number) => {
  let splitText = '';

  // 从前往前截取
  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];

    splitText += `${prompt}\n`;
    const tokens = encode(splitText).length;
    if (tokens >= maxTokens) {
      break;
    }
  }

  return splitText;
};
