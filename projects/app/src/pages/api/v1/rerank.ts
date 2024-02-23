import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { pushReRankBill } from '@/service/support/wallet/bill/push';
import { connectToDatabase } from '@/service/mongo';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { PostReRankProps, PostReRankResponse } from '@fastgpt/global/core/ai/api';
import { reRankRecall } from '@/service/core/ai/rerank';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  let { query, inputs } = req.body as PostReRankProps;
  try {
    await connectToDatabase();
    const { teamId, tmbId, apikey } = await authCert({
      req,
      authApiKey: true
    });
    await authTeamBalance(teamId);

    // max 150 length
    inputs = inputs.slice(0, 150);

    const result = await reRankRecall({ query, inputs });

    const { total } = pushReRankBill({
      teamId,
      tmbId,
      source: 'api',
      inputs
    });

    if (apikey) {
      updateApiKeyUsage({
        apikey,
        usage: total
      });
    }

    jsonRes<PostReRankResponse>(res, {
      data: result
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
