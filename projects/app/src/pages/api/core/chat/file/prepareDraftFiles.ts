import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  PrepareDraftFilesSchema,
  PrepareDraftFilesResponseSchema,
  type PrepareDraftFilesResponse
} from '@fastgpt/global/openapi/core/chat/file/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { isAuthorizedChatFileS3Key } from '@fastgpt/service/common/s3/sources/chat/key';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';
import { prepareAuthorizedDraftFiles } from '@/service/core/chat/file/draft';

/** 草稿附件的续期仅接受聊天权限和文件归属均已验证的 key；客户端不提供成员身份。 */
async function handler(req: ApiRequestProps): Promise<PrepareDraftFilesResponse> {
  const { sourceType, sourceId, outLinkAuthData, chatId, keys, remainingMs } = parseApiInput({
    req,
    bodySchema: PrepareDraftFilesSchema
  }).body;
  const auth = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  if (
    !keys.every((key) =>
      isAuthorizedChatFileS3Key({
        key,
        sourceType,
        sourceId: auth.sourceId,
        uid: auth.uid,
        chatId
      })
    )
  ) {
    return Promise.reject(ChatErrEnum.unAuthChat);
  }
  return PrepareDraftFilesResponseSchema.parse(
    await prepareAuthorizedDraftFiles({
      sourceType,
      sourceId: auth.sourceId,
      chatId,
      keys,
      remainingMs
    })
  );
}

export default NextAPI(handler);
