import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { connectToDatabase } from '@/service/mongo';
import { authDatasetData } from '@/service/support/permission/auth/dataset';
import { deleteDataByDataId } from '@/service/core/dataset/data/controller';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { dataId } = req.query as {
      dataId: string;
    };

    if (!dataId) {
      throw new Error('dataId is required');
    }

    // 凭证校验
    await authDatasetData({ req, authToken: true, dataId, per: 'w' });

    await deleteDataByDataId(dataId);

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
