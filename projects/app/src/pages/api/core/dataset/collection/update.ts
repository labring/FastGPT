import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { connectToDatabase } from '@/service/mongo';
import type { UpdateDatasetCollectionParams } from '@/global/core/api/datasetReq.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/auth/dataset';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await connectToDatabase();
    const { id, parentId, name } = req.body as UpdateDatasetCollectionParams;

    if (!id) {
      throw new Error('缺少参数');
    }

    // 凭证校验
    await authDatasetCollection({
      req,
      authToken: true,
      authApiKey: true,
      collectionId: id,
      per: 'w'
    });

    const updateFields: Record<string, any> = {
      ...(parentId !== undefined && { parentId: parentId || null }),
      ...(name && { name, updateTime: getCollectionUpdateTime({ name }) })
    };

    await MongoDatasetCollection.findByIdAndUpdate(id, {
      $set: updateFields
    });

    jsonRes(res);
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}
