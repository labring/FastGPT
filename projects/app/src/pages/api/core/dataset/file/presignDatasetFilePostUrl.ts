import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { authFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/utils';
import { addSeconds } from 'date-fns';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import {
  PresignDatasetFilePostUrlBodySchema,
  PresignDatasetFilePostUrlResponseSchema,
  type PresignDatasetFilePostUrlBody,
  type PresignDatasetFilePostUrlResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(
  req: ApiRequestProps<PresignDatasetFilePostUrlBody>
): Promise<PresignDatasetFilePostUrlResponse> {
  const { filename, datasetId } = PresignDatasetFilePostUrlBodySchema.parse(req.body);

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
    maxAmount: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    expiredTime: addSeconds(new Date(), 30) // 30s
  });

  const result = await getS3DatasetSource().createUploadDatasetFileURL({
    datasetId,
    filename,
    maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
  });

  return PresignDatasetFilePostUrlResponseSchema.parse(result);
}

export default NextAPI(handler);
