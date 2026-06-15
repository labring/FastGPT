import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  DeleteChatRecordBodySchema,
  DeleteChatRecordResponseSchema,
  type DeleteChatRecordResponseType
} from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const hasRequestBodyPayload = (body: unknown) =>
  !!body && typeof body === 'object' && Object.keys(body).length > 0;

async function handler(req: ApiRequestProps): Promise<DeleteChatRecordResponseType> {
  const params = hasRequestBodyPayload(req.body)
    ? parseApiInput({ req, bodySchema: DeleteChatRecordBodySchema }).body
    : parseApiInput({ req, querySchema: DeleteChatRecordBodySchema }).query;
  const { appId, chatId, contentId, contentIds, ...authProps } = params;
  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...authProps
  });

  const targetContentIds = Array.from(
    new Set([...(contentIds ?? []), ...(contentId ? [contentId] : [])])
  );

  if (targetContentIds.length === 0) {
    return DeleteChatRecordResponseSchema.parse(undefined);
  }

  await MongoChatItem.updateMany(
    {
      appId,
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
