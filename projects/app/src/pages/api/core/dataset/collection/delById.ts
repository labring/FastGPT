import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authUser } from '@fastgpt/service/support/user/auth';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delDataByCollectionId } from '@/service/core/dataset/data/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { collectionId } = req.query as { collectionId: string };

    if (!collectionId) {
      throw new Error('fileId and kbId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const collections = await findCollectionAndChild(collectionId, '_id');

    const delIdList = collections.map((item) => item._id);

    // delete all  trainingData, pgData, collection
    await delDataByCollectionId({ userId, collectionIds: delIdList });
    await MongoDatasetTraining.deleteMany({
      datasetCollectionId: { $in: delIdList },
      userId
    });
    await MongoDatasetCollection.deleteMany({
      _id: { $in: delIdList },
      userId
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
