import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { type CreatePostPresignedUrlResult } from '@fastgpt/service/common/s3/type';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';

export type updateAvatarQuery = {};

export type updateAvatarBody = {
  filename: string;
  autoExpired?: boolean;
};

export type updateAvatarResponse = CreatePostPresignedUrlResult;

async function handler(
  req: ApiRequestProps<updateAvatarBody, updateAvatarQuery>,
  _: ApiResponseType<updateAvatarResponse>
): Promise<updateAvatarResponse> {
  const { filename, autoExpired } = req.body;
  const { teamId } = await authCert({ req, authToken: true });
  return await getS3AvatarSource().createUploadAvatarURL({ teamId, filename, autoExpired });
}

export default NextAPI(handler);
