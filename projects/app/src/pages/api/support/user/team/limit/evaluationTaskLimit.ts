import type { NextApiRequest, NextApiResponse } from 'next';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { NextAPI } from '@/service/middleware/entry';
import { checkTeamEvaluationTaskLimit } from '@fastgpt/service/support/permission/teamLimit';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { teamId } = await authCert({
    req,
    authToken: true
  });

  const { amount = 1 } = req.query as { amount?: string };

  await checkTeamEvaluationTaskLimit(teamId, Number(amount));

  return 'success';
}

export default NextAPI(handler);
