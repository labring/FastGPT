import { softDeleteChatItems } from '@fastgpt/service/core/chat/delete';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import {
  DeleteChatRecordBodySchema,
  DeleteChatRecordQuerySchema
} from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const hasRequestBodyPayload = (body: unknown) =>
  !!body && typeof body === 'object' && Object.keys(body).length > 0;

/** 优先解析 JSON Body；仅 Body 为空时兼容旧 Query，解析失败不得回退到另一套身份。 */
async function handler(req: ApiRequestProps): Promise<void> {
  const params = hasRequestBodyPayload(req.body)
    ? parseApiInput({ req, bodySchema: DeleteChatRecordBodySchema }).body
    : parseApiInput({ req, querySchema: DeleteChatRecordQuerySchema }).query;
  const { sourceType, sourceId, chatId, contentId, contentIds, outLinkAuthData } = params;
  const authRes = await authChatTargetCrud({
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
