import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { assertRedisFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createUploadConstraints } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import {
  PresignSearchTestImageBodySchema,
  PresignSearchTestImageResponseSchema,
  type PresignSearchTestImageBody,
  type PresignSearchTestImageResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(
  req: ApiRequestProps<PresignSearchTestImageBody>
): Promise<PresignSearchTestImageResponse> {
  const { datasetId, filename, size } = parseApiInput({
    req,
    bodySchema: PresignSearchTestImageBodySchema
  }).body;
  const { teamId, userId } = await authDataset({
    datasetId,
    per: ReadPermissionVal,
    req,
    authToken: true,
    authApiKey: true
  });

  const planStatus = await getTeamPlanStatus({ teamId });
  await assertRedisFrequencyLimit({
    group: 'upload',
    id: String(userId),
    limit: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    seconds: 30
  });

  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename });
  const uploadPolicy = createUploadConstraints({
    filename,
    uploadConstraints: {
      allowedExtensions: parseAllowedExtensions(imageFileType)
    }
  });
  const result = await bucket.createUploadAccessUrl(
    { rawKey: fileKey, filename, ...(size !== undefined ? { size } : {}) },
    {
      expiredHours: 3,
      maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize,
      uploadPolicy
    }
  );

  return PresignSearchTestImageResponseSchema.parse(result);
}

export default NextAPI(handler);
