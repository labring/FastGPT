import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { updateChatFeedbackCount } from '@fastgpt/service/core/chat/controller';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  CloseCustomFeedbackBodySchema,
  CloseCustomFeedbackResponseSchema,
  type CloseCustomFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(req: ApiRequestProps): Promise<CloseCustomFeedbackResponseType> {
  const { appId, chatId, dataId, index } = parseApiInput({
    req,
    bodySchema: CloseCustomFeedbackBodySchema
  }).body;

  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId
  });
  await authCert({ req, authToken: true });

  await mongoSessionRun(async (session) => {
    // Remove custom feedback at index
    await MongoChatItem.findOneAndUpdate(
      { appId, chatId, dataId },
      { $unset: { [`customFeedbacks.${index}`]: 1 } },
      { session }
    );

    // Remove null values from array
    await MongoChatItem.updateOne(
      { appId, chatId, dataId },
      { $pull: { customFeedbacks: null } },
      { session }
    );

    // Update ChatLog feedback statistics
    await updateChatFeedbackCount({
      appId,
      chatId,
      session
    });
  });

  return CloseCustomFeedbackResponseSchema.parse(undefined);
}

export default NextAPI(handler);
