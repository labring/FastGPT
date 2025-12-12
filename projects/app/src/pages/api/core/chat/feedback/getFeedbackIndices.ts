import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ChatItemSchema } from '@fastgpt/global/core/chat/type';
import {
  GetFeedbackIndicesQuerySchema,
  type GetFeedbackIndicesQueryType,
  GetFeedbackIndicesResponseSchema,
  type GetFeedbackIndicesResponseType
} from '@fastgpt/global/openapi/core/chat/feedback/api';

async function handler(
  req: ApiRequestProps,
  _res: ApiResponseType<any>
): Promise<GetFeedbackIndicesResponseType> {
  const { appId, chatId, feedbackType, unreadOnly } = GetFeedbackIndicesQuerySchema.parse(
    req.query
  );

  await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId
  });

  const goodCondition = unreadOnly
    ? { userGoodFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } }
    : { userGoodFeedback: { $exists: true, $ne: null } };

  const badCondition = unreadOnly
    ? { userBadFeedback: { $exists: true, $ne: null }, isFeedbackRead: { $ne: true } }
    : { userBadFeedback: { $exists: true, $ne: null } };

  const feedbackConditionMap: Record<'all' | 'good' | 'bad', object> = {
    good: goodCondition,
    bad: badCondition,
    all: { $or: [goodCondition, badCondition] }
  };

  const query = {
    appId,
    chatId,
    obj: ChatRoleEnum.AI,
    ...feedbackConditionMap[feedbackType]
  };

  const chatItems = (await MongoChatItem.find(query, 'dataId time')
    .sort({ time: 1 })
    .lean()) as Pick<ChatItemSchema, 'dataId' | 'time'>[];

  const indices = chatItems.map((item, index) => ({
    dataId: item.dataId,
    index,
    time: item.time || new Date()
  }));

  return GetFeedbackIndicesResponseSchema.parse({
    total: indices.length,
    indices
  });
}

export default NextAPI(handler);
