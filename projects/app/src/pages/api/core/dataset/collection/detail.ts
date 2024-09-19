/* 
    Get one dataset collection detail
*/
import type { NextApiRequest } from 'next';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { getFileById } from '@fastgpt/service/common/file/gridfs/controller';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetCollectionItemType } from '@fastgpt/global/core/dataset/type';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';

async function handler(req: NextApiRequest): Promise<DatasetCollectionItemType> {
  const { id } = req.query as { id: string };

  if (!id) {
    return Promise.reject(CommonErrEnum.missingParams);
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
    ...getCollectionSourceData(collection),
    tags: await collectionTagsToTagLabel({
      datasetId: collection.datasetId._id,
      tags: collection.tags
    }),
    permission,
    file
  };
}

export default NextAPI(handler);
