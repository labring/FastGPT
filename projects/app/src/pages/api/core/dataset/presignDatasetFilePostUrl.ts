import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import type { PresignDatasetFilePostUrlParams } from '@fastgpt/global/core/dataset/v2/api';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';

async function handler(
  req: ApiRequestProps<PresignDatasetFilePostUrlParams>
): Promise<CreatePostPresignedUrlResult> {
  const { filename, datasetId } = req.body;

  const { teamId, userId } = await authDataset({
    datasetId,
    per: WritePermissionVal,
    req,
    authToken: true,
    authApiKey: true
  });

  const planStatus = await getTeamPlanStatus({ teamId });
  await authFrequencyLimit({
    eventId: `${userId}-uploadfile`,
    maxAmount:
      planStatus.standardConstants?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  return await getS3DatasetSource().createUploadDatasetFileURL({
    datasetId,
    filename,
    maxFileSize:
      planStatus.standardConstants?.maxUploadFileSize || global.feConfigs.uploadFileMaxSize
  });
}

export default NextAPI(handler);
