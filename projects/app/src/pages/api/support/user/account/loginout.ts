import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { logoutUserSessions } from '@fastgpt/service/support/user/account/session/service';

/** 保留历史全部设备退出入口；新客户端使用 Refresh Cookie 作用域内的 session/logout。 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  await logoutUserSessions({ req, res });
}
export default NextAPI(handler);
