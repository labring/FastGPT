import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { addHours } from 'date-fns';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { isS3ObjectKey, jwtSignS3DownloadToken } from '@fastgpt/service/common/s3/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  GetSearchTestImagePreviewUrlsBodySchema,
  GetSearchTestImagePreviewUrlsResponseSchema,
  type GetSearchTestImagePreviewUrlsBody,
  type GetSearchTestImagePreviewUrlsResponse
} from '@fastgpt/global/openapi/core/dataset/file/api';

async function handler(
  req: ApiRequestProps<GetSearchTestImagePreviewUrlsBody>
): Promise<GetSearchTestImagePreviewUrlsResponse> {
  const { datasetId, keys } = parseApiInput({
    req,
    bodySchema: GetSearchTestImagePreviewUrlsBodySchema
  }).body;
  const { teamId } = await authDataset({
    datasetId,
    per: ReadPermissionVal,
    req,
    authToken: true,
    authApiKey: true
  });

  const result = keys
    .filter((key) => isS3ObjectKey(key, 'temp') && key.startsWith(`temp/${teamId}/`))
    .map((key) => ({
      key,
      previewUrl: jwtSignS3DownloadToken({
        objectKey: key,
        bucketName: S3Buckets.private,
        expiredTime: addHours(new Date(), 1)
      })
    }));

  return GetSearchTestImagePreviewUrlsResponseSchema.parse(result);
}

export default NextAPI(handler);
