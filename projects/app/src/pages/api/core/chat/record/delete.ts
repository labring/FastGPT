import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/types';
import {
  DeleteChatRecordBodySchema,
  DeleteChatRecordResponseSchema,
  type DeleteChatRecordResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

const hasRequestBodyPayload = (body: unknown) =>
  !!body && typeof body === 'object' && Object.keys(body).length > 0;

async function handler(req: ApiRequestProps): Promise<DeleteChatRecordResponseType> {
  const params = hasRequestBodyPayload(req.body)
    ? parseApiInput({ req, bodySchema: DeleteChatRecordBodySchema }).body
    : parseApiInput({ req, querySchema: DeleteChatRecordBodySchema }).query;
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
    return DeleteChatRecordResponseSchema.parse(undefined);
  }

  await MongoChatItem.updateMany(
    {
      ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }),
      chatId,
      dataId: { $in: targetContentIds }
    },
    {
      $set: { deleteTime: new Date() }
    }
  );

  return DeleteChatRecordResponseSchema.parse(undefined);
}

export default NextAPI(handler);
