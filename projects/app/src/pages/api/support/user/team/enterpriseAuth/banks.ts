import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { EnterpriseAuthErrEnum } from '@fastgpt/global/support/user/team/enterpriseAuth/constant';
import {
  GetEnterpriseAuthBanksResponseSchema,
  type GetEnterpriseAuthBanksResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import {
  getEnterpriseAuthBanks,
  hasEnterpriseAuthServiceConfig
} from '@fastgpt/service/support/user/team/enterpriseAuth/transferClient';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<GetEnterpriseAuthBanksResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'GET' })) {
    return;
  }

  await authUserPer({ req, authToken: true });

  if (!hasEnterpriseAuthServiceConfig()) {
    throw new Error(EnterpriseAuthErrEnum.disabled);
  }

  const result = await getEnterpriseAuthBanks();
  return GetEnterpriseAuthBanksResponseSchema.parse(result);
}

export default NextAPI(handler);
