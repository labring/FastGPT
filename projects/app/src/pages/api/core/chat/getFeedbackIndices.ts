import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import type { FeedbackType } from '@/types/app';
import { MongoChatItem } from '@fastgpt/service/core/chat/chatItemSchema';
import type { ChatItemSchema } from '@fastgpt/global/core/chat/type';

export type GetFeedbackIndicesBody = {
  appId: string;
  chatId: string;
  feedbackType: FeedbackType;
  unreadOnly?: boolean;
};

export type FeedbackIndexItem = {
  dataId: string;
  index: number;
  time: Date;
};

export type GetFeedbackIndicesResponse = {
  total: number;
  indices: FeedbackIndexItem[];
};

async function handler(
  req: ApiRequestProps<GetFeedbackIndicesBody>,
  _res: ApiResponseType<any>
): Promise<GetFeedbackIndicesResponse> {
  const { appId, chatId, feedbackType, unreadOnly } = req.body;

  await authChatCrud({
    req,
    authToken: true,
    ...req.body
  });

  const goodCondition = unreadOnly
    ? { userGoodFeedback: { $exists: true, $ne: null }, adminGoodFeedbackRead: { $ne: true } }
    : { userGoodFeedback: { $exists: true, $ne: null } };

  const badCondition = unreadOnly
    ? { userBadFeedback: { $exists: true, $ne: null }, adminBadFeedbackRead: { $ne: true } }
    : { userBadFeedback: { $exists: true, $ne: null } };

  const feedbackConditionMap: Record<FeedbackType, object> = {
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

  const indices: FeedbackIndexItem[] = chatItems.map((item, index) => ({
    dataId: item.dataId,
    index,
    time: item.time || new Date()
  }));

  return {
    total: indices.length,
    indices
  };
}

export default NextAPI(handler);
