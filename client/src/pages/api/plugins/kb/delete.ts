import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB, App, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { Types } from 'mongoose';
import { PgTrainingTableName } from '@/constants/plugin';
import { GridFSStorage } from '@/service/lib/gridfs';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id } = req.query as {
      id: string;
    };

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    // delete training data
    await TrainingData.deleteMany({
      userId,
      kbId: id
    });

    // delete all pg data
    await PgClient.delete(PgTrainingTableName, {
      where: [['user_id', userId], 'AND', ['kb_id', id]]
    });

    // delete related files
    const gridFs = new GridFSStorage('dataset', userId);
    await gridFs.deleteFilesByKbId(id);

    // delete kb data
    await KB.findOneAndDelete({
      _id: id,
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
