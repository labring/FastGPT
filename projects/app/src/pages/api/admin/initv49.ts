import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextApiRequest, NextApiResponse } from 'next';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  await authCert({ req, authRoot: true });
  await changeChatItem();
  return { success: true };
}

export default NextAPI(handler);

const changeChatItem = async () => {
  try {
  } catch {}
};
