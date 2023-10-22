import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@/service/response';
import { connectToDatabase } from '@/service/mongo';
import { authUser } from '@fastgpt/service/support/user/auth';
import type { UpdateDatasetCollectionParams } from '@/global/core/api/datasetReq.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, parentId, name, metadata = {} } = req.body as UpdateDatasetCollectionParams;

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    const { userId } = await authUser({ req, authToken: true });

    const updateFields: Record<string, any> = {
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(name && { name, updateTime: getCollectionUpdateTime({ name }) })
    };

    // 将metadata的每个字段添加到updateFields中
    for (const [key, value] of Object.entries(metadata)) {
      updateFields[`metadata.${key}`] = value;
    }

    await MongoDatasetCollection.findOneAndUpdate(
      {
        _id: id,
        userId
      },
      {
        $set: updateFields
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
