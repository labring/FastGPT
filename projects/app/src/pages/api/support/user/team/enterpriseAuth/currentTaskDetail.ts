import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  GetEnterpriseAuthCurrentTaskDetailResponseSchema,
  type GetEnterpriseAuthCurrentTaskDetailResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { getEnterpriseAuthCurrentTaskDetail } from '@fastgpt/service/support/user/team/enterpriseAuth/controller';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<GetEnterpriseAuthCurrentTaskDetailResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'GET' })) {
    return;
  }

  const { teamId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const result = await getEnterpriseAuthCurrentTaskDetail(teamId);
  return GetEnterpriseAuthCurrentTaskDetailResponseSchema.parse(result);
}

export default NextAPI(handler);
