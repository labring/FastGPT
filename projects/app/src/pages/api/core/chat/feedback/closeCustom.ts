import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CloseCustomFeedbackBodySchema,
  CloseCustomFeedbackResponseSchema,
  type CloseCustomFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<CloseCustomFeedbackResponseType> {
  const { sourceType, sourceId, chatId, dataId, index, outLinkAuthData } = parseApiInput({
    req,
    bodySchema: CloseCustomFeedbackBodySchema
  }).body;

  const authRes = await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId,
    outLinkAuthData
  });
  const resolvedSourceId = authRes.sourceId;
  const chatSourceQuery = buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId });
  await authCert({ req, authToken: true });

  await mongoSessionRun(async (session) => {
    // Remove custom feedback at index
    await MongoChatItem.findOneAndUpdate(
      { ...chatSourceQuery, chatId, dataId },
      { $unset: { [`customFeedbacks.${index}`]: 1 } },
      { session }
    );

    // Remove null values from array
    await MongoChatItem.updateOne(
      { ...chatSourceQuery, chatId, dataId },
      { $pull: { customFeedbacks: null } },
      { session }
    );

    // Update ChatLog feedback statistics
    await updateChatFeedbackCount({
      sourceType,
      sourceId: resolvedSourceId,
      chatId,
      session
    });
  });

  return CloseCustomFeedbackResponseSchema.parse(undefined);
}

export default NextAPI(handler);
