import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { KbListItemType } from '@/types/plugin';
import { getVectorModel } from '@/service/utils/data';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const kbList = await KB.find(
      {
        userId
      },
      '_id avatar name tags vectorModel'
    ).sort({ updateTime: -1 });

    const data = await Promise.all(
      kbList.map(async (item) => ({
        _id: item._id,
        avatar: item.avatar,
        name: item.name,
        tags: item.tags,
        vectorModel: getVectorModel(item.vectorModel)
      }))
    );

    jsonRes<KbListItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
