import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { isS3ObjectKey, jwtSignS3DownloadToken } from '@fastgpt/service/common/s3/utils';
import { addMinutes } from 'date-fns';
import {
  GetTrainingDataDetailBodySchema,
  GetTrainingDataDetailResponseSchema,
  type GetTrainingDataDetailResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';

async function handler(req: ApiRequestProps): Promise<GetTrainingDataDetailResponse> {
  const { datasetId, collectionId, dataId } = GetTrainingDataDetailBodySchema.parse(req.body);

  const { teamId } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const data = await MongoDatasetTraining.findOne({ teamId, datasetId, _id: dataId }).lean();

  if (!data) {
    return GetTrainingDataDetailResponseSchema.parse(null);
  }

  return GetTrainingDataDetailResponseSchema.parse({
    _id: data._id,
    datasetId: data.datasetId,
    mode: data.mode,
    imagePreviewUrl:
      data.imageId && isS3ObjectKey(data.imageId, 'dataset')
        ? jwtSignS3DownloadToken({
            objectKey: data.imageId,
            bucketName: S3Buckets.private,
            expiredTime: addMinutes(new Date(), 30)
          })
        : undefined,
    q: data.q,
    a: data.a
  });
}

export default NextAPI(handler);
