import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { PgDatasetTableName } from '@/constants/plugin';
import { GridFSStorage } from '@/service/lib/gridfs';
import { Types } from 'mongoose';

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
    await TrainingData.deleteMany({
      userId,
      kbId: { $in: deletedIds.map((id) => new Types.ObjectId(id)) }
    });

    // delete all pg data
    await PgClient.delete(PgDatasetTableName, {
      where: [
        ['user_id', userId],
        'AND',
        `kb_id IN (${deletedIds.map((id) => `'${id}'`).join(',')})`
      ]
    });

    // delete related files
    const gridFs = new GridFSStorage('dataset', userId);
    await Promise.all(deletedIds.map((id) => gridFs.deleteFilesByKbId(id)));

    // delete kb data
    await KB.deleteMany({
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
  const children = await KB.find({ parentId: id });

  let allChildrenIds = children.map((child) => String(child._id));

  for (const child of children) {
    const grandChildrenIds = await findAllChildrenIds(child._id);
    allChildrenIds = allChildrenIds.concat(grandChildrenIds);
  }

  return allChildrenIds;
}
