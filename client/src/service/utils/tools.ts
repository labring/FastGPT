import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';
import { sseResponseEventEnum } from '@/constants/chat';

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

/* set cookie */
export const setCookie = (res: NextApiResponse, userId: string) => {
  res.setHeader('Set-Cookie', `token=${generateToken(userId)}; Path=/; HttpOnly; Max-Age=604800`);
};
/* clear cookie */
export const clearCookie = (res: NextApiResponse) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
};

/* openai axios config */
export const axiosConfig = (apikey: string) => {
  const openaiBaseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

  return {
    baseURL: apikey === process.env.ONEAPI_KEY ? process.env.ONEAPI_URL : openaiBaseUrl, // 此处仅对非 npm 模块有效
    httpsAgent: global.httpsAgent,
    headers: {
      Authorization: `Bearer ${apikey}`,
      auth: process.env.OPENAI_BASE_URL_AUTH || ''
    }
  };
};

export function withNextCors(handler: NextApiHandler): NextApiHandler {
  return async function nextApiHandlerWrappedWithNextCors(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    const methods = ['GET', 'eHEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
    const origin = req.headers.origin;
    await NextCors(req, res, {
      methods,
      origin: origin,
      optionsSuccessStatus: 200
    });

    return handler(req, res);
  };
}

export const startQueue = () => {
  for (let i = 0; i < global.systemEnv.qaMaxProcess; i++) {
    generateQA();
  }
  for (let i = 0; i < global.systemEnv.vectorMaxProcess; i++) {
    generateVector();
  }
};

export const sseResponse = ({
  res,
  event,
  data
}: {
  res: NextApiResponse;
  event?: `${sseResponseEventEnum}`;
  data: string;
}) => {
  event && res.write(`event: ${event}\n`);
  res.write(`data: ${data}\n\n`);
};
