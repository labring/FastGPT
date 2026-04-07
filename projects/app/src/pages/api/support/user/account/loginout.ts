import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert, clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import { deleteProxySessionsByTeam } from '@/service/core/sandbox/proxyUtils';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { userId, teamId } = await authCert({ req, authToken: true });
    await delUserAllSession(userId);
    // Clear all in-process proxy sessions for this team so sandboxed iframes
    // cannot continue to access the proxy after the user signs out.
    deleteProxySessionsByTeam(teamId);
  } catch (error) {}
  clearCookie(res);
}

export default NextAPI(handler);
