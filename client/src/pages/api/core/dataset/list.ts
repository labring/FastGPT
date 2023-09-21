import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase, KB } from '@/service/mongo';
import { authUser } from '@/service/utils/auth';
import { getVectorModel } from '@/service/utils/data';
import type { DatasetsItemType } from '@/types/core/dataset';
import { KbTypeEnum } from '@/constants/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { parentId, type } = req.query as { parentId?: string; type?: `${KbTypeEnum}` };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    await connectToDatabase();

    const kbList = await KB.find({
      userId,
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(type && { type })
    }).sort({ updateTime: -1 });

    const data = await Promise.all(
      kbList.map(async (item) => ({
        ...item.toJSON(),
        vectorModel: getVectorModel(item.vectorModel)
      }))
    );

    jsonRes<DatasetsItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
