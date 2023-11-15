import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { delDatasetFiles } from '@fastgpt/service/core/dataset/file/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';
import { delDataByDatasetId } from '@/service/core/dataset/data/controller';
import { findDatasetIdTreeByTopDatasetId } from '@fastgpt/service/core/dataset/controller';

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

    // delete training data(There could be a training mission)
    await MongoDatasetTraining.deleteMany({
      datasetId: { $in: deletedIds }
    });

    // delete all dataset.data and pg data
    await delDataByDatasetId({ datasetIds: deletedIds });

    // delete related files
    await delDatasetFiles({ datasetId: id });

    // delete collections
    await MongoDatasetCollection.deleteMany({
      datasetId: { $in: deletedIds }
    });

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
