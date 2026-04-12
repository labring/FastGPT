/*
    Get one dataset collection detail
*/
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { getCollectionSourceData } from '@fastgpt/global/core/dataset/collection/utils';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { collectionTagsToTagLabel } from '@fastgpt/service/core/dataset/collection/utils';
import { getVectorCount } from '@fastgpt/service/common/vectorDB/controller';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { isS3ObjectKey } from '@fastgpt/service/common/s3/utils';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import type { GetCollectionDetailResponseType } from '@fastgpt/global/openapi/core/dataset/collection/api';
import {
  GetCollectionDetailQuerySchema,
  GetCollectionDetailResponseSchema
} from '@fastgpt/global/openapi/core/dataset/collection/api';

async function handler(req: ApiRequestProps): Promise<GetCollectionDetailResponseType> {
  const { id } = GetCollectionDetailQuerySchema.parse(req.query);

  // 凭证校验
  const { collection, permission } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId: id,
    per: ReadPermissionVal
  });

  const fileId = collection?.fileId;
  if (fileId && !isS3ObjectKey(fileId, 'dataset')) {
    return Promise.reject('Invalid dataset file key');
  }

  const [file, indexAmount, errorCount] = await Promise.all([
    fileId ? getS3DatasetSource().getFileMetadata(fileId) : undefined,
    getVectorCount({
      teamId: collection.teamId,
      datasetId: collection.datasetId,
      collectionId: collection._id
    }),
    MongoDatasetTraining.countDocuments(
      {
        teamId: collection.teamId,
        datasetId: collection.datasetId,
        collectionId: id,
        errorMsg: { $exists: true },
        retryCount: { $lte: 0 }
      },
      readFromSecondary
    )
  ]);

  return GetCollectionDetailResponseSchema.parse({
    ...collection,
    indexAmount: indexAmount ?? 0,
    ...getCollectionSourceData(collection),
    tags: await collectionTagsToTagLabel({
      datasetId: collection.datasetId,
      tags: collection.tags
    }),
    permission,
    file,
    errorCount
  });
}

export default NextAPI(handler);
