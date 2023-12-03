import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';
import { connectToDatabase } from '@/service/mongo';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { getVectorsByText, GetVectorProps } from '@/service/core/ai/vector';
import { updateApiKeyUsage } from '@fastgpt/service/support/openapi/tools';
import { getBillSourceByAuthType } from '@fastgpt/global/support/wallet/bill/tools';

type Props = GetVectorProps & {
  billId?: string;
};

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    let { input, model, billId } = req.body as Props;
    await connectToDatabase();

    if (!Array.isArray(input) && typeof input !== 'string') {
      throw new Error('input is nor array or string');
    }

    const { teamId, tmbId, apikey, authType } = await authCert({
      req,
      authToken: true,
      authApiKey: true
    });

    await authTeamBalance(teamId);

    const { tokenLen, vectors } = await getVectorsByText({ input, model });

    jsonRes(res, {
      data: {
        object: 'list',
        data: vectors.map((item, index) => ({
          object: 'embedding',
          index: index,
          embedding: item
        })),
        model,
        usage: {
          prompt_tokens: tokenLen,
          total_tokens: tokenLen
        }
      }
    });

    const { total } = pushGenerateVectorBill({
      teamId,
      tmbId,
      tokenLen,
      model,
      billId,
      source: getBillSourceByAuthType({ authType })
    });

    if (apikey) {
      updateApiKeyUsage({
        apikey,
        usage: total
      });
    }
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
