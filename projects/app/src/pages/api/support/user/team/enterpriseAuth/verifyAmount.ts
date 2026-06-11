import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { ManagePermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  VerifyEnterpriseAuthAmountBodySchema,
  VerifyEnterpriseAuthAmountResponseSchema,
  type VerifyEnterpriseAuthAmountResponseType
} from '@fastgpt/global/openapi/support/user/team/enterpriseAuth/api';
import { verifyEnterpriseAuthAmount } from '@fastgpt/service/support/user/team/enterpriseAuth/controller';
import type { NextApiResponse } from 'next';
import { rejectUnsupportedEnterpriseAuthMethod } from '@/service/support/user/team/enterpriseAuth/methodGuard';

async function handler(
  req: ApiRequestProps,
  res: NextApiResponse
): Promise<VerifyEnterpriseAuthAmountResponseType | void> {
  if (rejectUnsupportedEnterpriseAuthMethod({ req, res, method: 'POST' })) {
    return;
  }

  const { body } = parseApiInput({ req, bodySchema: VerifyEnterpriseAuthAmountBodySchema });
  const { teamId, userId, tmbId } = await authUserPer({
    req,
    authToken: true,
    per: ManagePermissionVal
  });

  const result = await verifyEnterpriseAuthAmount({
    operator: {
      teamId,
      userId,
      tmbId
    },
    data: body
  });

  return VerifyEnterpriseAuthAmountResponseSchema.parse(result);
}

export default NextAPI(handler);
