import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { generateQA } from '../events/generateQA';
import { generateVector } from '../events/generateVector';

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
export const axiosConfig = (apikey: string) => ({
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  httpsAgent: global.httpsAgent,
  headers: {
    Authorization: `Bearer ${apikey}`,
    auth: process.env.OPENAI_BASE_URL_AUTH || ''
  }
});

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
  const qaMax = Number(process.env.QA_MAX_PROCESS || 10);
  const vectorMax = Number(process.env.VECTOR_MAX_PROCESS || 10);

  for (let i = 0; i < qaMax; i++) {
    generateQA();
  }
  for (let i = 0; i < vectorMax; i++) {
    generateVector();
  }
};
