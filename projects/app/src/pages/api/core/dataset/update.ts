import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import type { DatasetUpdateParams } from '@/api/core/dataset/index.d';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { id, parentId, name, avatar, tags } = req.body as DatasetUpdateParams;

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    await KB.findOneAndUpdate(
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
