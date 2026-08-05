import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { getS3DatasetSource } from '@fastgpt/service/common/s3/sources/dataset';
import { assertRedisFrequencyLimit } from '@fastgpt/service/common/system/frequencyLimit/redisFixedWindow';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import {
  PresignDatasetFilePostUrlBodySchema,
  type PresignDatasetFilePostUrlBody,
  PresignDatasetFilePostUrlResponseSchema,
  type PresignDatasetFilePostUrlResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<PresignDatasetFilePostUrlBody>
): Promise<PresignDatasetFilePostUrlResponse> {
  const { filename, datasetId, size } = parseApiInput({
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
  await assertRedisFrequencyLimit({
    group: 'upload',
    id: String(userId),
    limit: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount,
    seconds: 30
  });

  const result = await getS3DatasetSource().createUploadDatasetFileURL({
    datasetId,
    filename,
    size,
    maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
  });

  return PresignDatasetFilePostUrlResponseSchema.parse(result);
}

export default NextAPI(handler);
