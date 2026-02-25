import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

export type PresignTempFilePostUrlParams = {
  filename: string;
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
  const planStatus = await getTeamPlanStatus({ teamId });

  await authFrequencyLimit({
    eventId: `${tmbId}-uploadfile`,
    maxAmount:
      planStatus.standardConstants?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename });

  return await bucket.createPresignedPutUrl(
    { rawKey: fileKey, filename },
    {
      expiredHours: 1,
      maxFileSize:
        planStatus.standardConstants?.maxUploadFileSize || global.feConfigs.uploadFileMaxSize
    }
  );
}

export default NextAPI(handler);
