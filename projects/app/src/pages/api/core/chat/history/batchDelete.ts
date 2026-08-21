import { NextAPI } from '@/service/middleware/entry';
import { type ApiRequestProps } from '@fastgpt/next/type';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { ChatBatchDeleteBodySchema } from '@fastgpt/global/openapi/core/chat/history/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';
import { deleteChatResourcesBySource } from '@fastgpt/service/core/chat/delete';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';
import { ChatErrEnum } from '@fastgpt/global/common/error/code/chat';

const getBatchDeletePermission = (sourceType: ChatSourceTypeEnum) => {
  if (sourceType === ChatSourceTypeEnum.app) {
    return AppReadChatLogPerVal;
  }

  if (sourceType === ChatSourceTypeEnum.skillEdit) {
    return WritePermissionVal;
  }

  if (sourceType === ChatSourceTypeEnum.chatAgentHelper) {
    return AppReadChatLogPerVal;
  }

  if (sourceType === ChatSourceTypeEnum.workflowBuilder) {
    return WritePermissionVal;
  }

  const exhaustiveCheck: never = sourceType;
  throw new Error(`Unsupported chat source type: ${exhaustiveCheck}`);
};

async function handler(req: ApiRequestProps) {
  const { sourceType, sourceId, chatIds } = parseApiInput({
    req,
    bodySchema: ChatBatchDeleteBodySchema
  }).body;

  const authResult = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    per: getBatchDeletePermission(sourceType)
  });

  const deletableChatIds = await (async () => {
    if (sourceType !== ChatSourceTypeEnum.workflowBuilder) return chatIds;

    const chats = await MongoChat.find(
      {
        ...buildChatSourceQuery({ sourceType, sourceId }),
        chatId: { $in: chatIds }
      },
      'chatId teamId tmbId'
    ).lean();
    const hasUnownedChat = chats.some(
      (chat) =>
        String(chat.teamId) !== String(authResult.teamId) ||
        String(chat.tmbId) !== String(authResult.tmbId)
    );
    if (hasUnownedChat) return Promise.reject(ChatErrEnum.unAuthChat);

    // Builder 会话按成员隔离，只把已确认归属的 chatId 交给硬删除层；孤立 ID 不得删除资源。
    return chats.map((chat) => chat.chatId);
  })();

  await deleteChatResourcesBySource({
    sourceType,
    sourceId,
    chatIds: deletableChatIds
  });

  return;
}

export default NextAPI(handler);
