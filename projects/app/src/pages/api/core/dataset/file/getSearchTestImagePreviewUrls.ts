import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authDataset } from '@fastgpt/service/support/permission/dataset/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { addHours } from 'date-fns';
import { S3Buckets } from '@fastgpt/service/common/s3/config/constants';
import { isAuthorizedTempFileS3Key } from '@fastgpt/service/common/s3/sources/temp/key';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { createS3DownloadAccessUrls } from '@fastgpt/service/common/s3/accessLink';
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

  const authorizedKeys = Array.from(
    new Set(keys.filter((key) => isAuthorizedTempFileS3Key({ key, teamId })))
  );
  const previewUrls = await createS3DownloadAccessUrls(
    authorizedKeys.map((key) => ({
      objectKey: key,
      bucketName: S3Buckets.private,
      expiredTime: addHours(new Date(), 1)
    }))
  );
  const result = authorizedKeys.map((key, index) => ({
    key,
    previewUrl: previewUrls[index]!
  }));

  return GetSearchTestImagePreviewUrlsResponseSchema.parse(result);
}

export default NextAPI(handler);
