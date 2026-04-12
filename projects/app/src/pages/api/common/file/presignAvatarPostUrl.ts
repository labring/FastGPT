import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { getS3AvatarSource } from '@fastgpt/service/common/s3/sources/avatar';
import type { CreatePostPresignedUrlResonseType } from '@fastgpt/global/common/file/s3/type';

export type updateAvatarQuery = {};

export type updateAvatarBody = {
  filename: string;
  autoExpired?: boolean;
};

export type updateAvatarResponse = CreatePostPresignedUrlResonseType;

async function handler(
  req: ApiRequestProps<updateAvatarBody, updateAvatarQuery>,
  _: ApiResponseType<updateAvatarResponse>
): Promise<updateAvatarResponse> {
  const { filename, autoExpired } = req.body;

  const { teamId } = await authCert({ req, authToken: true });
  return await getS3AvatarSource().createUploadAvatarURL({
    teamId,
    filename,
    autoExpired
  });
}

export default NextAPI(handler);
