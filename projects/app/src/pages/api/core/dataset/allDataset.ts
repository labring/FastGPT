import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { MongoDataset } from '@fastgpt/core/dataset/schema';
import { authUser } from '@fastgpt/support/user/auth';
import { getVectorModel } from '@/service/utils/data';
import type { DatasetsItemType } from '@/types/core/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const kbList = await MongoDataset.find({
      userId,
      type: 'dataset'
    });

    const data = kbList.map((item) => ({
      ...item.toJSON(),
      vectorModel: getVectorModel(item.vectorModel)
    }));

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
