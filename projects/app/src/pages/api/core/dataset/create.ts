import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { CreateDatasetParams } from '@/api/core/dataset/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { name, tags, avatar, vectorModel, parentId, type } = req.body as CreateDatasetParams;

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const { _id } = await KB.create({
      name,
      userId,
      tags,
      vectorModel,
      avatar,
      parentId: parentId || null,
      type
    });

    jsonRes(res, { data: _id });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
