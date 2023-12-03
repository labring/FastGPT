import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { delDatasetRelevantData } from '@fastgpt/service/core/dataset/data/controller';
import { findDatasetIdTreeByTopDatasetId } from '@fastgpt/service/core/dataset/controller';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id } = req.query as {
      id: string;
    };

    if (!id) {
      throw new Error('缺少参数');
    }

    // auth owner
    await authDataset({ req, authToken: true, datasetId: id, per: 'owner' });

    const deletedIds = await findDatasetIdTreeByTopDatasetId(id);

    // delete all dataset.data and pg data
    await delDatasetRelevantData({ datasetIds: deletedIds });

    // delete dataset data
    await MongoDataset.deleteMany({
      _id: { $in: deletedIds }
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
