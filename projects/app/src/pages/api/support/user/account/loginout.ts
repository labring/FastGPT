import type { NextApiRequest, NextApiResponse } from 'next';
import { clearCookie } from '@fastgpt/service/support/permission/controller';
import { NextAPI } from '@/service/middleware/entry';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  clearCookie(res);
}

export default NextAPI(handler);
