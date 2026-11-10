import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { MarkChatReadBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { authChatTargetCrud } from '@fastgpt/service/core/chat/auth';
import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps, type ApiResponseType } from '@fastgpt/next/type';
import { ReadPermissionVal, WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

/** 将已授权的对话标为已读；App 要求读取权限，其他来源保留写权限及各自的会话范围。 */
export async function handler(req: ApiRequestProps, _res: ApiResponseType): Promise<void> {
  const body = parseApiInput({ req, bodySchema: MarkChatReadBodySchema }).body;
  const { sourceType, sourceId, chatId, outLinkAuthData } = body;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData,
    // App 的已读状态属于会话使用行为；Skill 等来源保留原有写权限，避免扩大修改范围。
    per: sourceType === ChatSourceTypeEnum.app ? ReadPermissionVal : WritePermissionVal
  });
  const resolvedSourceId = authRes.sourceId;

  await MongoChat.updateOne(
    { ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }), chatId },
    { $set: { hasBeenRead: true, updateTime: new Date() } }
  );
}

export default NextAPI(handler);
