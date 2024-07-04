import { MongoDatasetCollection } from '@fastgpt/service/core/dataset/collection/schema';
import { getCollectionUpdateTime } from '@fastgpt/service/core/dataset/collection/utils';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { ApiRequestProps } from '@fastgpt/service/type/next';

export type UpdateDatasetCollectionParams = {
  id: string;
  parentId?: string;
  name?: string;
  forbid?: boolean;
};

async function handler(req: ApiRequestProps<UpdateDatasetCollectionParams>) {
  const { id, parentId, name, forbid } = req.body;

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
    ...(name && { name, updateTime: getCollectionUpdateTime({ name }) }),
    ...(forbid !== undefined && { forbid })
  };

  await MongoDatasetCollection.findByIdAndUpdate(id, {
    $set: updateFields
  });
}

export default NextAPI(handler);
