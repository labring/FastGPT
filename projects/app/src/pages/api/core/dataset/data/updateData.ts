import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SetOneDatasetDataProps } from '@/global/core/api/datasetReq.d';
import { updateData2Dataset } from '@/service/core/dataset/data/controller';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { authTeamBalance } from '@/service/support/permission/auth/bill';
import { pushGenerateVectorBill } from '@/service/support/wallet/bill/push';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, collectionId, q = '', a } = req.body as SetOneDatasetDataProps;

    if (!id || !collectionId) {
      throw new Error('缺少参数');
    }

    // auth data permission
    const { datasetData, teamId, tmbId } = await authDatasetData({
      req,
      authToken: true,
      dataId: id,
      per: 'w'
    });
    // auth team balance
    await authTeamBalance(teamId);

    // auth user and get kb
    const dataset = await MongoDataset.findById(datasetData.datasetId, 'vectorModel');

    if (!dataset) {
      throw new Error("Can't find database");
    }

    const { tokenLen } = await updateData2Dataset({
      dataId: id,
      q,
      a,
      model: dataset.vectorModel
    });

    pushGenerateVectorBill({
      teamId,
      tmbId,
      tokenLen: tokenLen,
      model: dataset.vectorModel
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
