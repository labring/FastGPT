import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/controller';
import { findDatasetAndAllChildren } from '@fastgpt/service/core/dataset/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id: datasetId } = req.query as {
      id: string;
    };

    if (!datasetId) {
      throw new Error('缺少参数');
    }

    // auth owner
    const { teamId } = await authDataset({
      req,
      authToken: true,
      authApiKey: true,
      datasetId,
      per: 'owner'
    });

    const datasets = await findDatasetAndAllChildren({
      teamId,
      datasetId
    });

    // delete all dataset.data and pg data
    await delDatasetRelevantData({ datasets });

    // delete dataset data
    await MongoDataset.deleteMany({
      _id: { $in: datasets.map((d) => d._id) }
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
