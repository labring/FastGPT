import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authUser } from '@fastgpt/service/support/user/auth';
import { findCollectionAndChild } from '@fastgpt/service/core/dataset/collection/utils';
import { delDataByCollectionId } from '@/service/core/dataset/data/utils';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { GridFSStorage } from '@/service/lib/gridfs';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();

    const { collectionId } = req.query as { collectionId: string };

    if (!collectionId) {
      throw new Error('CollectionIdId is required');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    // find all delete id
    const collections = await findCollectionAndChild(collectionId, '_id metadata');
    const delIdList = collections.map((item) => item._id);

    // delete pg data
    await delDataByCollectionId({ userId, collectionIds: delIdList });

    // delete training data
    await MongoDatasetTraining.deleteMany({
      datasetCollectionId: { $in: delIdList },
      userId
    });

    // delete file
    const gridFs = new GridFSStorage('dataset', userId);
    const fileCollection = gridFs.Collection();
    await Promise.all(
      collections.map(
        (item) =>
          //@ts-ignore
          item.metadata?.fileId && fileCollection.findOneAndDelete({ _id: item.metadata.fileId })
      )
    );

    // delete collection
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
