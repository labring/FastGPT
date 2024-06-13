/* 
    Get one dataset collection detail
*/
import type { NextApiRequest, NextApiResponse } from 'next';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  const { id } = req.query as { id: string };

  if (!id) {
    return Promise.reject(DatasetErrEnum.missingParams);
  }

  // 凭证校验
  const { collection, permission } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: ReadPermissionVal
  });

  // get file
  const file = collection?.fileId
    ? await getFileById({ bucketName: BucketNameEnum.dataset, fileId: collection.fileId })
    : undefined;

  return {
    ...collection,
    canWrite: permission.hasWritePer,
    ...getCollectionSourceData(collection),
    file
  };
}

export default NextAPI(handler);
