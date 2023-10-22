import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { authUser } from '@fastgpt/service/support/user/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { GridFSStorage } from '@/service/lib/gridfs';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id } = req.query as {
      id: string;
    };

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const deletedIds = [id, ...(await findAllChildrenIds(id))];

    // delete training data
    await MongoDatasetTraining.deleteMany({
      userId,
      datasetId: { $in: deletedIds.map((id) => new Types.ObjectId(id)) }
    });

    // delete all pg data
    await PgClient.delete(PgDatasetTableName, {
      where: [
        ['user_id', userId],
        'AND',
        `dataset_id IN (${deletedIds.map((id) => `'${id}'`).join(',')})`
      ]
    });

    // delete related files
    const gridFs = new GridFSStorage('dataset', userId);
    await Promise.all(deletedIds.map((id) => gridFs.deleteFilesByDatasetId(id)));

    // delete collections
    await MongoDatasetCollection.deleteMany({
      datasetId: { $in: deletedIds }
    });

    // delete dataset data
    await MongoDataset.deleteMany({
      _id: { $in: deletedIds },
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

export async function findAllChildrenIds(id: string) {
  // find children
  const children = await MongoDataset.find({ parentId: id });

  let allChildrenIds = children.map((child) => String(child._id));

  for (const child of children) {
    const grandChildrenIds = await findAllChildrenIds(child._id);
    allChildrenIds = allChildrenIds.concat(grandChildrenIds);
  }

  return allChildrenIds;
}
