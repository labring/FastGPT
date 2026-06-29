import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  ResetEnterpriseAuthResponseSchema,
  type ResetEnterpriseAuthResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { resetEnterpriseAuthTask } from '@fastgpt/service/support/user/team/enterpriseAuth/controller';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<ResetEnterpriseAuthResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'POST' })) {
    return;
  }

  const { teamId, userId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  await resetEnterpriseAuthTask({
    teamId,
    userId,
    tmbId
  });
  return ResetEnterpriseAuthResponseSchema.parse(undefined);
}

export default NextAPI(handler);
