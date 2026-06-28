import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminUpdateFeedbackBodySchema,
  AdminUpdateFeedbackResponseSchema,
  type AdminUpdateFeedbackResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<AdminUpdateFeedbackResponseType> {
  const { sourceType, sourceId, chatId, dataId, datasetId, feedbackDataId, q, a, outLinkAuthData } =
    parseApiInput({
      req,
      bodySchema: AdminUpdateFeedbackBodySchema
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

  await MongoChatItem.updateOne(
    {
      ...buildChatSourceQuery({ sourceType, sourceId: resolvedSourceId }),
      chatId,
      dataId
    },
    {
      adminFeedback: {
        datasetId,
        dataId: feedbackDataId,
        q,
        a
      }
    }
  );

  return AdminUpdateFeedbackResponseSchema.parse(undefined);
}

export default NextAPI(handler);
