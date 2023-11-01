import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import jwt from 'jsonwebtoken';
import { NextApiResponse } from 'next';

/* create token */
export function createJWT(userId: string, tmbId = '') {
  const key = process.env.TOKEN_KEY as string;
  const token = jwt.sign(
    {
      userId: String(userId),
      tmbId: String(tmbId),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
    },
    key
  );
  return token;
}

// auth token
export function authJWT(token: string) {
  return new Promise<{ userId: string; tmbId: string }>((resolve, reject) => {
    const key = process.env.TOKEN_KEY as string;

    jwt.verify(token, key, function (err, decoded: any) {
      if (err || !decoded?.userId) {
        reject(ERROR_ENUM.unAuthorization);
        return;
      }

      resolve({
        userId: decoded.userId,
        tmbId: decoded.tmbId
      });
    });
  });
}

/* set cookie */
export const setCookie = (res: NextApiResponse, token: string) => {
  res.setHeader(
    'Set-Cookie',
    `token=${token}; Path=/; HttpOnly; Max-Age=604800; Samesite=None; Secure;`
  );
};
/* clear cookie */
export const clearCookie = (res: NextApiResponse) => {
  res.setHeader('Set-Cookie', 'token=; Path=/; Max-Age=0');
};
