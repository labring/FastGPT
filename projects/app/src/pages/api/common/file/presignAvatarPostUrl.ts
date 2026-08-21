import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  PresignAvatarPostUrlBodySchema,
  PresignAvatarPostUrlResponseSchema,
  type PresignAvatarPostUrlBody,
  type PresignAvatarPostUrlResponse
} from '@fastgpt/global/openapi/common/file/api';

async function handler(
  req: ApiRequestProps<PresignAvatarPostUrlBody>,
  _: ApiResponseType<PresignAvatarPostUrlResponse>
): Promise<PresignAvatarPostUrlResponse> {
  const { filename, size, autoExpired } = parseApiInput({
    req,
    bodySchema: PresignAvatarPostUrlBodySchema
  }).body;

  const { teamId } = await authCert({ req, authToken: true });
  return PresignAvatarPostUrlResponseSchema.parse(
    await getS3AvatarSource().createUploadAvatarURL({
      teamId,
      filename,
      size,
      autoExpired
    })
  );
}

export default NextAPI(handler);
