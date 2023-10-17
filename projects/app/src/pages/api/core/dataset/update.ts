import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/core/dataset/schema';
import { authUser } from '@fastgpt/support/user/auth';
import type { DatasetUpdateParams } from '@/global/core/api/datasetReq.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, parentId, name, avatar, tags } = req.body as DatasetUpdateParams;

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await MongoDataset.findOneAndUpdate(
      {
        _id: id,
        userId
      },
      {
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(name && { name }),
        ...(avatar && { avatar }),
        ...(typeof tags === 'string' && {
          tags: tags.split(' ').filter((item) => item)
        })
      }
    );

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
