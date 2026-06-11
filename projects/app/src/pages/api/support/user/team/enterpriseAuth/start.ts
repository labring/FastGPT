import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  StartEnterpriseAuthBodySchema,
  StartEnterpriseAuthResponseSchema,
  type StartEnterpriseAuthResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { startEnterpriseAuth } from '@fastgpt/service/support/user/team/enterpriseAuth/controller';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<StartEnterpriseAuthResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'POST' })) {
    return;
  }

  const { body } = parseApiInput({ req, bodySchema: StartEnterpriseAuthBodySchema });
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const result = await startEnterpriseAuth({
    teamId,
    data: body
  });

  return StartEnterpriseAuthResponseSchema.parse(result);
}

export default NextAPI(handler);
