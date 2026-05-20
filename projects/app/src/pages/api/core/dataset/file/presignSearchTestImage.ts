import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { imageFileType } from '@fastgpt/global/common/file/constants';
import { parseAllowedExtensions } from '@fastgpt/service/common/s3/utils/uploadConstraints';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  PresignSearchTestImageBodySchema,
  PresignSearchTestImageResponseSchema,
  type PresignSearchTestImageBody,
  type PresignSearchTestImageResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(
  req: ApiRequestProps<PresignSearchTestImageBody>
): Promise<PresignSearchTestImageResponse> {
  const { datasetId, filename } = parseApiInput({
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
  await authFrequencyLimit({
    eventId: `${userId}-uploadfile`,
    maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30),
    num: 1
  });

  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename });
  const result = await bucket.createPresignedPutUrl(
    { rawKey: fileKey, filename },
    {
      expiredHours: 3,
      maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize,
      uploadConstraints: {
        allowedExtensions: parseAllowedExtensions(imageFileType)
      }
    }
  );

  return PresignSearchTestImageResponseSchema.parse(result);
}

export default NextAPI(handler);
