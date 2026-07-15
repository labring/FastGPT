import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type { CreatePostPresignedUrlResponseType } from '@fastgpt/global/common/file/s3/type';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { PresignDraftChatFilePostUrlSchema } from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { createAuthorizedChatFileUploadUrl } from '@/service/core/chat/file/upload';

async function handler(req: ApiRequestProps): Promise<CreatePostPresignedUrlResponseType> {
  const {
    filename,
    contentType,
    declaredExtension,
    declaredFilename,
    size,
    sourceType,
    sourceId,
    chatId,
    fileSelectConfig
  } = parseApiInput({
    req,
    bodySchema: PresignDraftChatFilePostUrlSchema
  }).body;

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    ...(sourceType === ChatSourceTypeEnum.skillEdit ? { per: WritePermissionVal } : {})
  });

  if (sourceType === ChatSourceTypeEnum.app) {
    await authApp({
      req,
      authToken: true,
      authApiKey: true,
      appId: authRes.sourceId,
      per: WritePermissionVal
    });
  }

  return createAuthorizedChatFileUploadUrl({
    sourceType: authRes.sourceType,
    sourceId: authRes.sourceId,
    chatId,
    teamId: authRes.teamId,
    uid: authRes.uid,
    fileSelectConfig,
    filename,
    contentType,
    declaredExtension,
    declaredFilename,
    size
  });
}

export default NextAPI(handler);
