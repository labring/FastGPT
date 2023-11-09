import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { PgClient } from '@fastgpt/service/common/pg';
import { PgDatasetTableName } from '@fastgpt/global/core/dataset/constant';
import { delDatasetFiles } from '@fastgpt/service/core/dataset/file/controller';
import { Types } from '@fastgpt/service/common/mongo';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { authDataset } from '@fastgpt/service/support/permission/auth/dataset';

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

    const deletedIds = [id, ...(await findAllChildrenIds(id))];

    // delete training data
    await MongoDatasetTraining.deleteMany({
      datasetId: { $in: deletedIds.map((id) => new Types.ObjectId(id)) }
    });

    // delete all pg data
    await PgClient.delete(PgDatasetTableName, {
      where: [`dataset_id IN (${deletedIds.map((id) => `'${id}'`).join(',')})`]
    });

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
