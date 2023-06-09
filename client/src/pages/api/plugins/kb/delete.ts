import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB, Model, TrainingData } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { Types } from 'mongoose';

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

    // delete all pg data
    await PgClient.delete('modelData', {
      where: [['user_id', userId], 'AND', ['kb_id', id]]
    });

    // delete training data
    await TrainingData.deleteMany({
      userId,
      kbId: id
    });

    // delete related model
    await Model.updateMany(
      {
        userId
      },
      { $pull: { 'chat.relatedKbs': new Types.ObjectId(id) } }
    );

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
