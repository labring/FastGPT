import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import {
  GetEnterpriseAuthStatusResponseSchema,
  type GetEnterpriseAuthStatusResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { getEnterpriseAuthStatus } from '@fastgpt/service/support/user/team/enterpriseAuth/controller';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<GetEnterpriseAuthStatusResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'GET' })) {
    return;
  }

  const { teamId, userId, tmbId, permission } = await authUserPer({ req, authToken: true });

  const result = await getEnterpriseAuthStatus({
    operator: {
      teamId,
      userId,
      tmbId
    },
    teamId,
    canManage: permission.hasManagePer
  });

  return GetEnterpriseAuthStatusResponseSchema.parse(result);
}

export default NextAPI(handler);
