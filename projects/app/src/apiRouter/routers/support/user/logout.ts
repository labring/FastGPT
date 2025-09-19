import { RestAPI } from '@/service/middleware/entry';
import type { contract } from '@fastgpt/global/common/tsRest/contract';
import type { Handler } from '@fastgpt/global/common/tsRest/types';
import { authCert, clearCookie } from '@fastgpt/service/support/permission/auth/common';
import { delUserAllSession } from '@fastgpt/service/support/user/session';

const handler: Handler<typeof contract.support.user.logout> = async ({ headers, req, res }) => {
  try {
    const { userId } = await authCert({ req, authToken: true });
    await delUserAllSession(userId);
  } catch (error) {
  } finally {
    clearCookie(res);
  }
};

export default RestAPI(handler);
