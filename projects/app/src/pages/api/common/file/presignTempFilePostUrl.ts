import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  PresignTempFilePostUrlBodySchema,
  PresignTempFilePostUrlResponseSchema,
  type PresignTempFilePostUrlBody,
  type PresignTempFilePostUrlResponse
} from '@fastgpt/global/openapi/common/file/api';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { assertUploadRateLimit } from '@fastgpt/service/common/rateLimit/interface/upload';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

async function handler(
  req: ApiRequestProps<PresignTempFilePostUrlBody>
): Promise<PresignTempFilePostUrlResponse> {
  const { filename, size } = parseApiInput({
    req,
    bodySchema: PresignTempFilePostUrlBodySchema
  }).body;

  const { teamId, tmbId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: TeamDatasetCreatePermissionVal
  });
  const planStatus = await getTeamPlanStatus({ teamId });

  await assertUploadRateLimit({
    identity: String(tmbId),
    limit: planStatus.standard?.maxUploadFileCount || global.feConfigs.uploadFileMaxAmount
  });

  const bucket = new S3PrivateBucket();
  const { fileKey } = getFileS3Key.temp({ teamId, filename });

  return PresignTempFilePostUrlResponseSchema.parse(
    await bucket.createUploadAccessUrl(
      { rawKey: fileKey, filename, ...(size !== undefined ? { size } : {}) },
      {
        expiredHours: 1,
        maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
      }
    )
  );
}

export default NextAPI(handler);
