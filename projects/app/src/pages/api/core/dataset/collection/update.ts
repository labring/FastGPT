import type { NextApiRequest } from 'next';
import type { UpdateDatasetCollectionParams } from '@/global/core/api/datasetReq.d';
import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(req: NextApiRequest) {
  const { id, parentId, name } = req.body as UpdateDatasetCollectionParams;

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: WritePermissionVal
  });

  const updateFields: Record<string, any> = {
    ...(parentId !== undefined && { parentId: parentId || null }),
    ...(name && { name, updateTime: getCollectionUpdateTime({ name }) })
  };

  await MongoDatasetCollection.findByIdAndUpdate(id, {
    $set: updateFields
  });
}

export default NextAPI(handler);
