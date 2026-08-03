import type { ApiRequestProps, ApiResponseType } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { BoolSchema } from '@fastgpt/global/common/zod';
import type z from 'zod';
import {
  PresignFileUploadParamsSchema,
  type CreatePostPresignedUrlResponseType
} from '@fastgpt/global/common/file/s3/type';

export type updateAvatarQuery = Record<string, never>;

export const UpdateAvatarBodySchema = PresignFileUploadParamsSchema.extend({
  autoExpired: BoolSchema.optional()
});
export type updateAvatarBody = z.infer<typeof UpdateAvatarBodySchema>;

export type updateAvatarResponse = CreatePostPresignedUrlResponseType;

async function handler(
  req: ApiRequestProps<updateAvatarBody, updateAvatarQuery>,
  _: ApiResponseType<updateAvatarResponse>
): Promise<updateAvatarResponse> {
  const { filename, size, autoExpired } = parseApiInput({
    req,
    bodySchema: UpdateAvatarBodySchema
  }).body;

  const { teamId } = await authCert({ req, authToken: true });
  return await getS3AvatarSource().createUploadAvatarURL({
    teamId,
    filename,
    size,
    autoExpired
  });
}

export default NextAPI(handler);
