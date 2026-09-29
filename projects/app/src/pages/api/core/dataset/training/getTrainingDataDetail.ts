import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoDatasetTraining } from '@fastgpt/service/core/dataset/training/schema';
import { authDatasetCollection } from '@fastgpt/service/support/permission/dataset/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { isAuthorizedDatasetFileS3Key } from '@fastgpt/service/common/s3/sources/dataset/key';
import { addMinutes } from 'date-fns';
import {
  GetTrainingDataDetailBodySchema,
  GetTrainingDataDetailResponseSchema,
  type GetTrainingDataDetailResponse
} from '@fastgpt/global/openapi/core/dataset/training/api';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createS3DownloadAccessUrl } from '@fastgpt/service/common/s3/accessLink';

async function handler(req: ApiRequestProps): Promise<GetTrainingDataDetailResponse> {
  const { collectionId, dataId } = parseApiInput({
    req,
    bodySchema: GetTrainingDataDetailBodySchema
  }).body;

  const { collection } = await authDatasetCollection({
    req,
    authToken: true,
    authApiKey: true,
    collectionId,
    per: ReadPermissionVal
  });

  const data = await MongoDatasetTraining.findOne({
    teamId: collection.teamId,
    datasetId: collection.datasetId,
    collectionId: collection._id,
    _id: dataId
  }).lean();

  if (!data) {
    return GetTrainingDataDetailResponseSchema.parse(null);
  }

  const imagePreviewUrl =
    // imageId 可能来自历史脏数据，签发前需确认 key 归属于当前已鉴权 collection 的 dataset。
    data.imageId &&
    isAuthorizedDatasetFileS3Key({ key: data.imageId, datasetId: collection.datasetId })
      ? await createS3DownloadAccessUrl({
          objectKey: data.imageId,
          bucketName: S3Buckets.private,
          expiredTime: addMinutes(new Date(), 30)
        })
      : undefined;

  return GetTrainingDataDetailResponseSchema.parse({
    _id: data._id,
    datasetId: data.datasetId,
    collectionId: data.collectionId,
    mode: data.mode,
    imagePreviewUrl,
    q: data.q,
    a: data.a
  });
}

export default NextAPI(handler);
