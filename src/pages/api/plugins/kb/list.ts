import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authToken } from '@/service/utils/auth';
import { PgClient } from '@/service/pg';
import { KbItemType } from '@/types/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    // 凭证校验
    const userId = await authToken(req);

    await connectToDatabase();

    const kbList = await KB.find({
      userId
    }).sort({ updateTime: -1 });

    const data = await Promise.all(
      kbList.map(async (item) => ({
        _id: item._id,
        avatar: item.avatar,
        name: item.name,
        userId: item.userId,
        updateTime: item.updateTime,
        tags: item.tags.join(' '),
        totalData: await PgClient.count('modelData', {
          where: [['user_id', userId], 'AND', ['kb_id', item._id]]
        })
      }))
    );

    jsonRes<KbItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
