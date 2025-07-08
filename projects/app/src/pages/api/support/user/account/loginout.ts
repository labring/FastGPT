import type { NextApiRequest, NextApiResponse } from 'next';
import { clearCookie } from '@fastgpt/service/support/permission/controller';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { delUserAllSession } from '@fastgpt/service/support/user/session';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { userId } = await authCert({ req, authToken: true });
    await delUserAllSession(userId);
  } catch (error) {}
  clearCookie(res);
}

export default NextAPI(handler);
