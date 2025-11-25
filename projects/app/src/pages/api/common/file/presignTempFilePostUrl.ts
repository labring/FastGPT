import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { authFrequencyLimit } from '@/service/common/frequencyLimit/api';
import { addSeconds } from 'date-fns';

export type PresignTempFilePostUrlParams = {
  filename: string;
};

const authUploadLimit = (tmbId: string) => {
  if (!global.feConfigs.uploadFileMaxAmount) return;
  return authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount: global.feConfigs.uploadFileMaxAmount * 2,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });
};

async function handler(
  req: ApiRequestProps<PresignTempFilePostUrlParams>
): Promise<CreatePostPresignedUrlResult> {
  const { filename } = req.body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamDatasetCreatePermissionVal
  });

  await authUploadLimit(tmbId);

  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename });

  return await bucket.createPostPresignedUrl({ rawKey: fileKey, filename }, { expiredHours: 1 });
}

export default NextAPI(handler);
