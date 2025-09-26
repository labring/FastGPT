import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert, setCsrfCookie } from '@fastgpt/service/support/permission/auth/common';
import jwt from 'jsonwebtoken';
import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';

export type GenerateCsrfTokenQuery = {};
export type GenerateCsrfTokenBody = {};
export type GenerateCsrfTokenResponse = {
  csrfToken: string;
  expiresAt: number;
};

async function handler(
  req: ApiRequestProps<GenerateCsrfTokenBody, GenerateCsrfTokenQuery>,
  res: ApiResponseType<GenerateCsrfTokenResponse>
): Promise<GenerateCsrfTokenResponse> {
  const jwtSecret = process.env.TOKEN_KEY || 'any';
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  const csrfToken = jwt.sign(
    {
      type: 'csrf',
      exp: expiresAt
    },
    jwtSecret,
    {
      algorithm: 'HS256'
    }
  );

  setCsrfCookie(res, csrfToken);

  return {
    csrfToken,
    expiresAt
  };
}

export default NextAPI(handler, { isCSRFCheck: false });
