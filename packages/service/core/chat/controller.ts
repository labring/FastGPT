import type { ChatHistoryItemResType, ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { MongoChat } from './chatSchema';
import { addLog } from '../../common/system/log';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { MongoChatItemResponse } from './chatItemResponseSchema';
import type { ClientSession } from '../../common/mongo';
import { Types } from '../../common/mongo';
import { mongoSessionRun } from '../../common/mongo/sessionRun';

export async function getChatItems({
  appId,
  chatId,
  offset,
  limit,
  field,
  feedbackType,
  unreadOnly
}: {
  appId: string;
  chatId?: string;
  offset: number;
  limit: number;
  field: string;
  feedbackType?: 'all' | 'good' | 'bad';
  unreadOnly?: boolean;
}): Promise<{ histories: ChatItemType[]; total: number }> {
  if (!chatId) {
    return { histories: [], total: 0 };
  }

  // Extend dataId
  field = `dataId ${field}`;

  // Build feedback filter condition
  const buildFeedbackCondition = () => {
    if (!feedbackType || feedbackType === 'all') {
      return {};
    }

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
    }

    return {};
  };

  const feedbackCondition = buildFeedbackCondition();

  // Normal pagination
  const [histories, total] = await Promise.all([
    MongoChatItem.find({ appId, chatId, ...feedbackCondition }, field)
      .sort({ _id: -1 })
      .skip(offset)
      .limit(limit)
      .lean(),
    MongoChatItem.countDocuments({ appId, chatId, ...feedbackCondition })
  ]);

  // Reverse to chronological order
  const chronologicalHistories = histories.reverse();

  // Add node responses field
  if (field.includes(DispatchNodeResponseKeyEnum.nodeResponse)) {
    const chatItemDataIds = chronologicalHistories
      .filter((item) => item.obj === ChatRoleEnum.AI && !item.responseData?.length)
      .map((item) => item.dataId);

    const chatItemResponsesMap = await MongoChatItemResponse.find(
      { appId, chatId, chatItemDataId: { $in: chatItemDataIds } },
      { chatItemDataId: 1, data: 1 }
    )
      .lean()
      .then((res) => {
        const map = new Map<string, ChatHistoryItemResType[]>();
        res.forEach((item) => {
          const val = map.get(item.chatItemDataId) || [];
          val.push(item.data);
          map.set(item.chatItemDataId, val);
        });
        return map;
      });

    chronologicalHistories.forEach((item) => {
      const val = chatItemResponsesMap.get(String(item.dataId));
      if (item.obj === ChatRoleEnum.AI && val) {
        item.responseData = val;
      }
    });
  }

  return { histories: chronologicalHistories, total };
}

export const addCustomFeedbacks = async ({
  appId,
  chatId,
  dataId,
  feedbacks
}: {
  appId: string;
  chatId?: string;
  dataId?: string;
  feedbacks: string[];
}) => {
  if (!chatId || !dataId) return;

  try {
    await mongoSessionRun(async (session) => {
      // Add custom feedbacks to ChatItem
      await MongoChatItem.updateOne(
        {
          appId,
          chatId,
          dataId
        },
        {
          $push: { customFeedbacks: { $each: feedbacks } }
        },
        { session }
      );

      // Update ChatLog feedback statistics
      await updateChatFeedbackCount({
        appId,
        chatId,
        session
      });
    });
  } catch (error) {
    addLog.error('addCustomFeedbacks error', error);
    throw error;
  }
};

/**
 * Update feedback count statistics for a chat in Chat table
 * This method aggregates feedback data from chatItems and updates the Chat table
 *
 * @param appId - Application ID
 * @param chatId - Chat ID
 * @param session - Optional MongoDB session for transaction support
 */
export async function updateChatFeedbackCount({
  appId,
  chatId,
  session
}: {
  appId: string;
  chatId: string;
  session?: ClientSession;
}): Promise<void> {
  try {
    // Aggregate feedback statistics from chatItems
    const stats = await MongoChatItem.aggregate(
      [
        {
          $match: {
            appId: new Types.ObjectId(appId),
            chatId,
            obj: ChatRoleEnum.AI
          }
        },
        {
          $group: {
            _id: null,
            goodFeedbackCount: {
              $sum: {
                $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0]
              }
            },
            badFeedbackCount: {
              $sum: {
                $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0]
              }
            },
            // Calculate unread good feedback count
            unreadGoodFeedbackCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$isFeedbackRead', false] }, true] },
                      { $ne: [{ $ifNull: ['$userGoodFeedback', null] }, null] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            // Calculate unread bad feedback count
            unreadBadFeedbackCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: [{ $ifNull: ['$isFeedbackRead', false] }, true] },
                      { $ne: [{ $ifNull: ['$userBadFeedback', null] }, null] }
                    ]
                  },
                  1,
                  0
                ]
              }
            }
          }
        }
      ],
      { session }
    );

    const feedbackStats = stats[0] || {
      goodFeedbackCount: 0,
      badFeedbackCount: 0,
      unreadGoodFeedbackCount: 0,
      unreadBadFeedbackCount: 0
    };

    // Calculate boolean flags
    const hasGoodFeedback = feedbackStats.goodFeedbackCount > 0;
    const hasBadFeedback = feedbackStats.badFeedbackCount > 0;
    const hasUnreadGoodFeedback = feedbackStats.unreadGoodFeedbackCount > 0;
    const hasUnreadBadFeedback = feedbackStats.unreadBadFeedbackCount > 0;

    // Build update object - only set fields that are true, unset fields that are false
    const updateObj: Record<string, any> = {};
    const unsetObj: Record<string, any> = {};

    if (hasGoodFeedback) {
      updateObj.hasGoodFeedback = true;
    } else {
      unsetObj.hasGoodFeedback = '';
    }

    if (hasBadFeedback) {
      updateObj.hasBadFeedback = true;
    } else {
      unsetObj.hasBadFeedback = '';
    }

    if (hasUnreadGoodFeedback) {
      updateObj.hasUnreadGoodFeedback = true;
    } else {
      unsetObj.hasUnreadGoodFeedback = '';
    }

    if (hasUnreadBadFeedback) {
      updateObj.hasUnreadBadFeedback = true;
    } else {
      unsetObj.hasUnreadBadFeedback = '';
    }

    // Build the final update query
    const updateQuery: Record<string, any> = {};
    if (Object.keys(updateObj).length > 0) {
      updateQuery.$set = updateObj;
    }
    if (Object.keys(unsetObj).length > 0) {
      updateQuery.$unset = unsetObj;
    }

    // Update Chat table with aggregated statistics and boolean flags
    await MongoChat.updateOne(
      {
        appId,
        chatId
      },
      updateQuery,
      {
        session
      }
    );

    addLog.debug('updateChatFeedbackCount success', {
      appId,
      chatId,
      stats: feedbackStats,
      hasGoodFeedback,
      hasBadFeedback,
      hasUnreadGoodFeedback,
      hasUnreadBadFeedback
    });
  } catch (error) {
    addLog.error('updateChatFeedbackCount error', error);
    throw error;
  }
}
