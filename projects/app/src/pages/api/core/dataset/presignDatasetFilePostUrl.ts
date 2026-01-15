import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';
import type { PresignDatasetFilePostUrlParams } from '@fastgpt/global/core/dataset/v2/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(
  req: ApiRequestProps<PresignDatasetFilePostUrlParams>
): Promise<CreatePostPresignedUrlResult> {
  const { filename, datasetId } = req.body;

  const { userId } = await authDataset({
    datasetId,
    per: WritePermissionVal,
    req,
    authToken: true,
    authApiKey: true
  });

  await authUploadLimit(userId);

  return await getS3DatasetSource().createUploadDatasetFileURL({
    datasetId,
    filename
  });
}

export default NextAPI(handler);
