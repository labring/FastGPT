import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  PresignFileUploadParamsSchema,
  type CreatePostPresignedUrlResponseType,
  type PresignFileUploadParams
} from '@fastgpt/global/common/file/s3/type';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { TeamDatasetCreatePermissionVal } from '@fastgpt/global/support/permission/user/constant';
import { getFileS3Key } from '@fastgpt/service/common/s3/utils';
import { S3PrivateBucket } from '@fastgpt/service/common/s3/buckets/private';
import { assertUploadRateLimit } from '@fastgpt/service/common/rateLimit/interface/upload';
import { getTeamPlanStatus } from '@fastgpt/service/support/wallet/sub/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type PresignTempFilePostUrlParams = PresignFileUploadParams;

async function handler(
  req: ApiRequestProps<PresignTempFilePostUrlParams>
): Promise<CreatePostPresignedUrlResponseType> {
  const { filename, size } = parseApiInput({
    req,
    bodySchema: PresignFileUploadParamsSchema
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

  return await bucket.createUploadAccessUrl(
    { rawKey: fileKey, filename, ...(size !== undefined ? { size } : {}) },
    {
      expiredHours: 1,
      maxFileSize: planStatus.standard?.maxUploadFileSize ?? global.feConfigs.uploadFileMaxSize
    }
  );
}

export default NextAPI(handler);
