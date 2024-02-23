import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTeamSubPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { getStandardSubPlan } from '@/service/support/wallet/sub/utils';
import { FeTeamSubType } from '@fastgpt/global/support/wallet/sub/type';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    // 凭证校验
    const { teamId } = await authCert({
      req,
      authToken: true
    });

    jsonRes<FeTeamSubType>(res, {
      data: await getTeamSubPlanStatus({
        teamId,
        standardPlans: getStandardSubPlan()
      })
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
