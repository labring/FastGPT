import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatTargetCrud } from '@/service/support/permission/auth/chat';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import {
  GetFeedbackRecordIdsBodySchema,
  GetFeedbackRecordIdsResponseSchema,
  type GetFeedbackRecordIdsResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildChatSourceQuery } from '@fastgpt/service/core/chat/source';

async function handler(req: ApiRequestProps): Promise<GetFeedbackRecordIdsResponseType> {
  const { sourceType, sourceId, chatId, feedbackType, unreadOnly } = parseApiInput({
    req,
    bodySchema: GetFeedbackRecordIdsBodySchema
  }).body;

  if (!sourceId || !chatId) {
    return {
      total: 0,
      dataIds: []
    };
  }

  // Auth check
  await authChatTargetCrud({
    req,
    authToken: true,
    authApiKey: true,
    sourceType,
    sourceId,
    chatId
  });

  // Build feedback filter condition
  const buildFeedbackCondition = () => {
    const goodCondition = unreadOnly
      ? { userGoodFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } }
      : { userGoodFeedback: { $exists: true, $ne: null } };

    const badCondition = unreadOnly
      ? { userBadFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } }
      : { userBadFeedback: { $exists: true, $ne: null } };

    if (feedbackType === 'good') {
      return { obj: ChatRoleEnum.AI, ...goodCondition };
    } else if (feedbackType === 'bad') {
      return { obj: ChatRoleEnum.AI, ...badCondition };
    } else if (feedbackType === 'has_feedback') {
      // has_feedback means either good or bad
      if (unreadOnly) {
        return {
          obj: ChatRoleEnum.AI,
          $or: [
            { userGoodFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } },
            { userBadFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } }
          ]
        };
      } else {
        return {
          obj: ChatRoleEnum.AI,
          $or: [
            { userGoodFeedback: { $exists: true, $ne: null } },
            { userBadFeedback: { $exists: true, $ne: null } }
          ]
        };
      }
    }

    return {};
  };

  const feedbackCondition = buildFeedbackCondition();
  const chatSourceQuery = buildChatSourceQuery({ sourceType, sourceId });

  // Query feedback records, only return dataId field
  const [items, total] = await Promise.all([
    MongoChatItem.find({ ...chatSourceQuery, chatId, ...feedbackCondition }, 'dataId')
      .sort({ _id: 1 }) // Sort in chronological order
      .lean(),
    MongoChatItem.countDocuments({ ...chatSourceQuery, chatId, ...feedbackCondition })
  ]);

  const dataIds = items.map((item) => item.dataId).filter(Boolean);

  return GetFeedbackRecordIdsResponseSchema.parse({
    total,
    dataIds
  });
}

export default NextAPI(handler);
