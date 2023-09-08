import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { getVectorModel } from '@/service/utils/data';
import { KbListItemType } from '@/types/plugin';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { parentId } = req.query as { parentId: string };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const kbList = await KB.find({
      userId,
      parentId: parentId || null
    }).sort({ updateTime: -1 });

    const data = await Promise.all(
      kbList.map(async (item) => ({
        ...item.toJSON(),
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
