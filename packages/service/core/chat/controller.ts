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
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export async function getChatItems({
  includeDeleted = false,
  appId,
  chatId,
  field,
  limit,

  offset,
  initialId,
  prevId,
  nextId
}: {
  includeDeleted?: boolean;
  appId: string;
  chatId?: string;
  field: string;
  limit: number;

  offset?: number;
  initialId?: string;
  prevId?: string;
  nextId?: string;
}): Promise<{
  histories: ChatItemType[];
  total: number;
  hasMorePrev: boolean;
  hasMoreNext: boolean;
}> {
  if (!chatId) {
    return { histories: [], total: 0, hasMorePrev: false, hasMoreNext: false };
  }

  // 过滤已删除的记录（用户端看不到已删除的对话）
  const query = { chatId, appId, deleted: { $ne: true } };

  // Extend dataId
  field = `dataId ${field}`;
  const baseCondition = includeDeleted ? { appId, chatId } : { appId, chatId, deleteTime: null };

  const { histories, total, hasMorePrev, hasMoreNext } = await (async () => {
    // Mode 1: offset pagination (original logic)
    if (offset !== undefined) {
      const [foundHistories, count] = await Promise.all([
        MongoChatItem.find(baseCondition, field).sort({ _id: -1 }).skip(offset).limit(limit).lean(),
        MongoChatItem.countDocuments(baseCondition)
      ]);
      return {
        histories: foundHistories.reverse(),
        total: count,
        hasMorePrev: count > limit,
        hasMoreNext: offset > 0
      };
    }
    // Mode 2: prevId - get records before the target
    else if (prevId) {
      const prevItem = await MongoChatItem.findOne(
        {
          ...baseCondition,
          dataId: prevId
        },
        { _id: 1 }
      ).lean();
      if (!prevItem) return Promise.reject(new UserError('Prev item not found'));

      const [items, count] = await Promise.all([
        MongoChatItem.find({ ...baseCondition, _id: { $lt: prevItem._id } }, field)
          .sort({ _id: -1 })
          .limit(limit + 1)
          .lean(),
        MongoChatItem.countDocuments({ ...baseCondition })
      ]);

      return {
        histories: items.slice(0, limit).reverse(),
        total: count,
        hasMorePrev: items.length > limit,
        hasMoreNext: true
      };
    }
    // Mode 3: nextId - get records after the target
    else if (nextId) {
      const nextItem = await MongoChatItem.findOne(
        {
          ...baseCondition,
          dataId: nextId
        },
        { _id: 1 }
      ).lean();
      if (!nextItem) return Promise.reject(new UserError('Next item not found'));

      const [items, total] = await Promise.all([
        MongoChatItem.find({ ...baseCondition, _id: { $gt: nextItem._id } }, field)
          .sort({ _id: 1 })
          .limit(limit + 1)
          .lean(),
        MongoChatItem.countDocuments({ ...baseCondition })
      ]);

      return {
        histories: items.slice(0, limit),
        total,
        hasMorePrev: true,
        hasMoreNext: items.length > limit
      };
    }
    // Mode 2: initialId - get records around the target
    else {
      if (!initialId) {
        const [foundHistories, count] = await Promise.all([
          MongoChatItem.find(baseCondition, field).sort({ _id: -1 }).skip(0).limit(limit).lean(),
          MongoChatItem.countDocuments(baseCondition)
        ]);
        return {
          histories: foundHistories.reverse(),
          total: count,
          hasMorePrev: count > limit,
          hasMoreNext: false
        };
      }

      const halfLimit = Math.floor(limit / 2);
      const ceilLimit = Math.ceil(limit / 2);

      const targetItem = await MongoChatItem.findOne(
        { ...baseCondition, dataId: initialId },
        field
      ).lean();
      if (!targetItem) return Promise.reject(new UserError('Target item not found'));

      const [prevItems, nextItems, count] = await Promise.all([
        MongoChatItem.find({ ...baseCondition, _id: { $lt: targetItem._id } }, field)
          .sort({ _id: -1 })
          .limit(halfLimit + 1)
          .lean(),
        MongoChatItem.find({ ...baseCondition, _id: { $gt: targetItem._id } }, field)
          .sort({ _id: 1 })
          .limit(ceilLimit + 1)
          .lean(),
        MongoChatItem.countDocuments(baseCondition)
      ]);

      return {
        histories: [
          ...prevItems.slice(0, halfLimit).reverse(),
          targetItem,
          ...nextItems.slice(0, ceilLimit)
        ].filter(Boolean),
        total: count,
        hasMorePrev: prevItems.length > halfLimit,
        hasMoreNext: nextItems.length > ceilLimit
      };
    }
  })();

  // Add node responses field
  if (field.includes(DispatchNodeResponseKeyEnum.nodeResponse) && histories.length > 0) {
    const chatItemDataIds = histories
      .filter((item) => item.obj === ChatRoleEnum.AI && !item.responseData?.length)
      .map((item) => item.dataId);

    if (chatItemDataIds.length > 0) {
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

      histories.forEach((item) => {
        const val = chatItemResponsesMap.get(String(item.dataId));
        if (item.obj === ChatRoleEnum.AI && val) {
          item.responseData = val;
        }
      });
    }
  }

  return { histories, total, hasMorePrev, hasMoreNext };
}

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

// Helper function to parse field string to MongoDB projection object
function parseFieldsToProjection(fieldString: string): Record<string, 1> {
  const fields = fieldString.trim().split(/\s+/);
  const projection: Record<string, 1> = {};
  fields.forEach((field) => {
    if (field) {
      projection[field] = 1;
    }
  });
  return projection;
}

export async function getPaginationChatItems({
  appId,
  chatId,
  offset,
  pageSize,
  field,
  chatLogsFilter = ChatLogsFilterEnum.all,
  filterDeleted = true
}: {
  appId: string;
  chatId: string;
  offset: number;
  pageSize: number;
  field: string;
  chatLogsFilter?: `${ChatLogsFilterEnum}`;
  filterDeleted?: boolean; // 是否过滤已删除的记录（用户端默认true，管理员端传false）
}): Promise<{
  histories: ChatItemType[];
  total: number;
  goodTotal: number;
  badTotal: number;
  notFoundTotal: number;
}> {
  // Build aggregation pipeline using $facet for one-time query
  const fieldProjection = parseFieldsToProjection(field);

  const appObjectId = new Types.ObjectId(appId);

  // 构建基础匹配条件
  const baseMatch: any = { appId: appObjectId, chatId };
  // 如果需要过滤已删除的记录，添加 deleted 条件
  if (filterDeleted) {
    baseMatch.deleted = { $ne: true };
  }

  const pipeline: any[] = [
    { $match: baseMatch },
    {
      $addFields: {
        hasNotFoundKnowledge: {
          $cond: [
            { $eq: ['$obj', ChatRoleEnum.AI] },
            {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: { $ifNull: ['$responseData', []] },
                      as: 'node',
                      cond: {
                        $and: [
                          { $eq: ['$$node.moduleType', FlowNodeTypeEnum.datasetSearchNode] },
                          { $eq: [{ $size: { $ifNull: ['$$node.quoteList', []] } }, 0] }
                        ]
                      }
                    }
                  }
                },
                0
              ]
            },
            false
          ]
        }
      }
    },

    // Stage 3: Use $facet to perform multiple operations in parallel
    {
      $facet: {
        // Branch 1: Get paginated AI data only
        paginatedData: [
          // Only query AI messages
          { $match: { obj: ChatRoleEnum.AI } },

          // Apply filter based on chatLogsFilter
          ...(chatLogsFilter === ChatLogsFilterEnum.good
            ? [{ $match: { userGoodFeedback: { $exists: true } } }]
            : chatLogsFilter === ChatLogsFilterEnum.bad
              ? [{ $match: { userBadFeedback: { $exists: true } } }]
              : chatLogsFilter === ChatLogsFilterEnum.notFoundKnowledge
                ? [{ $match: { hasNotFoundKnowledge: true } }]
                : []),

          { $sort: { _id: -1 } },
          { $skip: Math.floor(offset / 2) },
          { $limit: Math.ceil(pageSize / 2) },
          { $project: { ...fieldProjection, _id: 1 } }
        ],

        // Branch 2: Calculate statistics for all types
        statistics: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              goodTotal: { $sum: { $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0] } },
              badTotal: { $sum: { $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0] } },
              notFoundTotal: { $sum: { $cond: ['$hasNotFoundKnowledge', 1, 0] } }
            }
          }
        ]
      }
    }
  ];

  // Execute aggregation
  const [result] = await MongoChatItem.aggregate(pipeline);

  // Extract AI messages
  const aiMessages: any[] = result.paginatedData || [];
  const stats = result.statistics[0] || {
    total: 0,
    goodTotal: 0,
    badTotal: 0,
    notFoundTotal: 0
  };

  // Calculate total based on filter type
  const { total, goodTotal, badTotal, notFoundTotal } = stats;

  // Query corresponding Human messages if AI messages exist
  let histories: ChatItemType[] = [];

  if (aiMessages.length > 0) {
    // Get all AI _id values and find the maximum (latest in this page)
    const aiIds = aiMessages.map((msg) => msg._id);
    const maxAiId = aiIds[0]; // AI messages are already sorted by _id ascending

    // Query Human messages with _id less than the maximum AI _id
    // Use descending sort + limit to get only the most recent Human messages
    // Then reverse to ascending order for efficient pairing
    // Build Human messages query with same deleted filter as AI messages
    const humanQuery: any = {
      appId: appObjectId,
      chatId,
      obj: ChatRoleEnum.Human,
      _id: { $lt: maxAiId }
    };
    // Apply the same deleted filter as baseMatch
    if (filterDeleted) {
      humanQuery.deleted = { $ne: true };
    }

    const humanMessages: any[] = (
      await MongoChatItem.find(humanQuery, fieldProjection)
        .sort({ _id: -1 }) // Descending: get the most recent Human messages first
        .limit(aiMessages.length) // Limit to avoid querying too many historical messages
        .lean()
    ).reverse(); // Reverse to ascending order for efficient lookup

    // Create a map to pair each AI with its corresponding Human message
    // This ensures each Human is used only once (no duplicates)
    const humanMap = new Map<string, any>();
    aiIds.forEach((aiId) => {
      // Find the Human message with the largest _id that is less than this AI's _id
      let matchingHuman: any = null;
      for (let i = humanMessages.length - 1; i >= 0; i--) {
        if (humanMessages[i]._id < aiId) {
          matchingHuman = humanMessages[i];
          break;
        }
      }
      if (matchingHuman) {
        humanMap.set(aiId.toString(), matchingHuman);
      }
    });

    // Pair messages in correct order (aiMessages are already sorted by _id ascending)
    const pairedMessages: any[] = [];
    for (let i = aiMessages.length - 1; i >= 0; i--) {
      const ai = aiMessages[i];
      const human = humanMap.get(ai._id.toString());
      if (human) {
        pairedMessages.push(human);
      }
      pairedMessages.push(ai);
    }
    histories = pairedMessages;
  }

  return {
    histories,
    total,
    goodTotal,
    badTotal,
    notFoundTotal
  };
}
