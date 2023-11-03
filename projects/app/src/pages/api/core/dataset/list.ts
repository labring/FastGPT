import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import { getVectorModel } from '@/service/core/ai/model';
import type { DatasetItemType } from '@/types/core/dataset';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constant';
import { MongoDataset } from '@fastgpt/service/core/dataset/schema';
import { mongoRPermission } from '@fastgpt/global/support/permission/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { parentId, type } = req.query as { parentId?: string; type?: `${DatasetTypeEnum}` };
    // 凭证校验
    const { teamId, tmbId } = await authUser({ req, authToken: true });

    const datasets = await MongoDataset.find({
      ...mongoRPermission({ teamId, tmbId }),
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(type && { type })
    }).sort({ updateTime: -1 });

    const data = await Promise.all(
      datasets.map(async (item) => ({
        ...item.toJSON(),
        tags: item.tags.join(' '),
        vectorModel: getVectorModel(item.vectorModel),
        isOwner: String(item.tmbId) === tmbId
      }))
    );

    jsonRes<DatasetItemType[]>(res, {
      data
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
