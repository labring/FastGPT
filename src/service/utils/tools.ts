import type { NextApiResponse, NextApiHandler, NextApiRequest } from 'next';
import NextCors from 'nextjs-cors';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

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
export const axiosConfig = () => ({
  httpsAgent: global.httpsAgent,
  headers: {
    auth: process.env.OPENAI_BASE_URL_AUTH || ''
  }
});

export function withNextCors(handler: NextApiHandler): NextApiHandler {
  return async function nextApiHandlerWrappedWithNextCors(
    req: NextApiRequest,
    res: NextApiResponse
  ) {
    const methods = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
    const origin = req.headers.origin;
    await NextCors(req, res, {
      methods,
      origin: origin,
      optionsSuccessStatus: 200
    });

    return handler(req, res);
  };
}
