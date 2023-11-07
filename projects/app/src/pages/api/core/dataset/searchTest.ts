import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import type { SearchTestProps } from '@/global/core/api/datasetReq.d';
import { connectToDatabase } from '@/service/mongo';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';
import { searchDatasetData } from '@/service/core/dataset/data/utils';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { datasetId, text, limit = 20 } = req.body as SearchTestProps;

    if (!datasetId || !text) {
      throw new Error('缺少参数');
    }

    // auth dataset role
    const { dataset, teamId, tmbId } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'r'
    });

    // auth balance
    await authTeamBalance(teamId);

    const { searchRes, tokenLen } = await searchDatasetData({
      text,
      model: dataset.vectorModel,
      limit: Math.min(limit, 50),
      datasetIds: [datasetId]
    });

    // push bill
    pushGenerateVectorBill({
      teamId,
      tmbId,
      tokenLen: tokenLen,
      model: dataset.vectorModel
    });

    jsonRes<SearchDataResponseItemType[]>(res, {
      data: searchRes
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
