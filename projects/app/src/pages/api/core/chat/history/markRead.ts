import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MarkChatReadBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/next/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

/** 将对话标为已读（例如用户在本页看完流式回复后） */
export async function handler(req: ApiRequestProps, _res: ApiResponseType): Promise<void> {
  const body = parseApiInput({ req, bodySchema: MarkChatReadBodySchema }).body;
  const { customUid, authProxy, sourceType, sourceId, chatId, outLinkAuthData } = body;

  const authRes = await authChatTargetCrud({
    customUid,
    authProxy,
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    // 标记已读只需读权限：隐藏应用（首页对话）只放行 Read，普通成员仍只能操作自己的会话。
    per: ReadPermissionVal
  });
  const resolvedSourceId = authRes.sourceId;

  await MongoChat.updateOne(
    { ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }), chatId },
    { $set: { hasBeenRead: true, updateTime: new Date() } }
  );
}

export default NextAPI(handler);
