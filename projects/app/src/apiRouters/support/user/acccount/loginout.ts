import type { Handler } from '@fastgpt/global/common/tsRest/type';
import { RestAPI } from '@/service/middleware/entry';
import { authCert, clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { delUserAllSession } from '@fastgpt/service/support/user/session';
import type { accountContract } from '@fastgpt/global/common/tsRest/fastgpt/contracts/support/user/account';

const handler: Handler<typeof accountContract.logout> = async ({ req, res }) => {
  try {
    const { userId } = await authCert({ req, authToken: true });
    await delUserAllSession(userId);
  } catch (error) {}
  clearCookie(res);
};

export const loginout = RestAPI(handler);
