import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/support/user/auth';
import { getVectorModel } from '@/service/utils/data';
import type { DatasetsItemType } from '@/types/core/dataset';
import { DatasetTypeEnum } from '@fastgpt/core/dataset/constant';
import { MongoDataset } from '@fastgpt/core/dataset/schema';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { parentId, type } = req.query as { parentId?: string; type?: `${DatasetTypeEnum}` };
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const kbList = await MongoDataset.find({
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
