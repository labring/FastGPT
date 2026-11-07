import { softDeleteChatItems } from '@fastgpt/service/core/chat/delete';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { DeleteChatRecordBodySchema } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

/** 按 JSON Body 中的会话身份鉴权并软删除消息，外链凭证保持对象形态。 */
async function handler(req: ApiRequestProps): Promise<void> {
  const {
    customUid,
    authProxy,
    sourceType,
    sourceId,
    chatId,
    contentId,
    contentIds,
    outLinkAuthData
  } = parseApiInput({
    req,
    bodySchema: DeleteChatRecordBodySchema
  }).body;
  const authRes = await authChatTargetCrud({
    customUid,
    authProxy,
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    ...(sourceType === ChatSourceTypeEnum.skillEdit ? { per: WritePermissionVal } : {}),
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;

  const targetContentIds = Array.from(
    new Set([...(contentIds ?? []), ...(contentId ? [contentId] : [])])
  );

  if (targetContentIds.length === 0) {
    return;
  }

  await softDeleteChatItems({
    sourceType: authRes.sourceType,
    sourceId: resolvedSourceId,
    chatId,
    contentIds: targetContentIds
  });
}

export default NextAPI(handler);
