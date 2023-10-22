import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { authUser } from '@fastgpt/service/support/user/auth';
import { withNextCors } from '@fastgpt/service/common/middle/cors';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import type { SetOneDatasetDataProps } from '@/global/core/api/datasetReq.d';
import { updateData2Dataset } from '@/service/core/dataset/data/utils';

export default withNextCors(async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, datasetId, collectionId, q = '', a } = req.body as SetOneDatasetDataProps;

    if (!id || !collectionId) {
      throw new Error('缺少参数');
    }

    // auth user and get kb
    const [{ userId }, dataset] = await Promise.all([
      authUser({ req, authToken: true }),
      MongoDataset.findById(datasetId, 'vectorModel')
    ]);

    if (!dataset) {
      throw new Error("Can't find database");
    }

    await updateData2Dataset({
      dataId: id,
      userId,
      q,
      a,
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
