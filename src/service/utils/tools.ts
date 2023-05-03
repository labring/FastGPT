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

/* openai axios config */
export const axiosConfig = () => ({
  httpsAgent: global.httpsAgent,
  headers: {
    auth: process.env.OPENAI_BASE_URL_AUTH || ''
  }
});
