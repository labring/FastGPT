import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  UpdateFeedbackReadStatusBodySchema,
  UpdateFeedbackReadStatusResponseSchema,
  type UpdateFeedbackReadStatusResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<UpdateFeedbackReadStatusResponseType> {
  const { sourceType, sourceId, chatId, dataId, isRead, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: UpdateFeedbackReadStatusBodySchema
  }).body;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;
  const chatSourceQuery = buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId });

  await mongoSessionRun(async (session) => {
    await MongoChatItem.updateOne(
      {
        ...chatSourceQuery,
        chatId,
        dataId,
        obj: ChatRoleEnum.AI
      },
      {
        $set: {
          isFeedbackRead: isRead
        }
      },
      { session }
    );

    // Update Chat table feedback statistics to refresh unread feedback flags
    await updateChatFeedbackCount({
      sourceType,
      sourceId: resolvedSourceId,
      chatId,
      session
    });
  });

  return UpdateFeedbackReadStatusResponseSchema.parse({ success: true });
}

export default NextAPI(handler);
