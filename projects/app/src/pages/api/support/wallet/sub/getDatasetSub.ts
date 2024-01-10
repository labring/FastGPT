import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getTeamDatasetValidSub } from '@fastgpt/service/support/wallet/sub/utils';
import { getVectorCountByTeamId } from '@fastgpt/service/common/vectorStore/controller';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    // 凭证校验
    const { teamId } = await authCert({
      req,
      authToken: true
    });

    const [{ sub, maxSize }, usedSize] = await Promise.all([
      getTeamDatasetValidSub({
        teamId,
        freeSize: global.feConfigs?.subscription?.datasetStoreFreeSize
      }),
      getVectorCountByTeamId(teamId)
    ]);

    jsonRes(res, {
      data: {
        sub,
        maxSize,
        usedSize
      }
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
