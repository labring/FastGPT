import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { getS3ChatSource } from '@fastgpt/service/common/s3/sources/chat';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import type { OutLinkChatAuthProps } from '@fastgpt/global/support/permission/chat';

export type presignChatFileGetUrlQuery = {};

export type presignChatFileGetUrlBody = {
  key: string;
  appId: string;
  outLinkAuthData?: OutLinkChatAuthProps;
};

export type presignChatFileGetUrlResponse = string;

async function handler(
  req: ApiRequestProps<presignChatFileGetUrlBody, presignChatFileGetUrlQuery>,
  _: ApiResponseType<presignChatFileGetUrlResponse>
): Promise<presignChatFileGetUrlResponse> {
  const { key, appId, outLinkAuthData } = req.body;

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    ...outLinkAuthData
  });

  return await getS3ChatSource().createGetChatFileURL({ key });
}

export default NextAPI(handler);
