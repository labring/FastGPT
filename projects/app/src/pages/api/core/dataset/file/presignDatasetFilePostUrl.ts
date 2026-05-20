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
  type PresignDatasetFilePostUrlBody
} from '@fastgpt/global/openapi/core/dataset/file/api';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<PresignDatasetFilePostUrlBody>
): Promise<CreatePostPresignedUrlResponseType> {
  const { filename, datasetId } = parseApiInput({
    req,
    bodySchema: PresignDatasetFilePostUrlBodySchema
  }).body;

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

  return getS3DatasetSource().createUploadDatasetFileURL({
    datasetId,
    filename,
    maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
  });
}

export default NextAPI(handler);
