import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { delDatasetDataByDataId } from '@fastgpt/service/core/dataset/data/controller';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id: dataId } = req.query as {
      id: string;
    };

    if (!dataId) {
      throw new Error('dataId is required');
    }

    // 凭证校验
    const { datasetData } = await authDatasetData({
      req,
      authToken: true,
      authApiKey: true,
      dataId,
      per: 'w'
    });

    await delDatasetDataByDataId({
      collectionId: datasetData.collectionId,
      mongoDataId: dataId
    });

    jsonRes(res, {
      data: 'success'
    });
  } catch (err) {
    console.log(err);
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
});
