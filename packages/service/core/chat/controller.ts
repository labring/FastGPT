import type { ChatItemType } from '@fastgpt/global/core/chat/type';
import { MongoChatItem } from './chatItemSchema';
import { addLog } from '../../common/system/log';
import { delFileByFileIdList, getGFSCollection } from '../../common/file/gridfs/controller';
import { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import { MongoChat } from './chatSchema';
import { UserError } from '@fastgpt/global/common/error/utils';
import { ChatRoleEnum } from '@fastgpt/global/core/chat/constants';
import { ChatLogsFilterEnum } from '@fastgpt/global/core/chat/correction/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { Types } from '../../common/mongo';

export async function getChatItems({
  appId,
  chatId,
  offset,
  limit,
  field
}: {
  appId: string;
  chatId?: string;
  offset: number;
  limit: number;
  field: string;
}): Promise<{ histories: ChatItemType[]; total: number }> {
  if (!chatId) {
    return { histories: [], total: 0 };
  }

  const [histories, total] = await Promise.all([
    MongoChatItem.find({ chatId, appId }, field).sort({ _id: -1 }).skip(offset).limit(limit).lean(),
    MongoChatItem.countDocuments({ chatId, appId })
  ]);
  histories.reverse();

  return { histories, total };
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
    await MongoChatItem.findOneAndUpdate(
      {
        appId,
        chatId,
        dataId
      },
      {
        $push: { customFeedbacks: { $each: feedbacks } }
      }
    );
  } catch (error) {
    addLog.error('addCustomFeedbacks error', error);
  }
};

/* 
  Delete chat files
  1. ChatId: Delete one chat files
  2. AppId: Delete all the app's chat files
*/
export const deleteChatFiles = async ({
  chatIdList,
  appId
}: {
  chatIdList?: string[];
  appId?: string;
}) => {
  if (!appId && !chatIdList)
    return Promise.reject(new UserError('appId or chatIdList is required'));

  const appChatIdList = await (async () => {
    if (appId) {
      const appChatIdList = await MongoChat.find({ appId }, { chatId: 1 });
      return appChatIdList.map((item) => String(item.chatId));
    } else if (chatIdList) {
      return chatIdList;
    }
    return [];
  })();

  const collection = getGFSCollection(BucketNameEnum.chat);
  const where = {
    'metadata.chatId': { $in: appChatIdList }
  };

  const files = await collection.find(where, { projection: { _id: 1 } }).toArray();

  await delFileByFileIdList({
    bucketName: BucketNameEnum.chat,
    fileIdList: files.map((item) => String(item._id))
  });
};

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
  chatLogsFilter = ChatLogsFilterEnum.all
}: {
  appId: string;
  chatId: string;
  offset: number;
  pageSize: number;
  field: string;
  chatLogsFilter?: `${ChatLogsFilterEnum}`;
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

  const pipeline: any[] = [
    { $match: { appId: appObjectId, chatId } },
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
            ? [{ $match: { userGoodFeedback: { $exists: true, $ne: '' } } }]
            : chatLogsFilter === ChatLogsFilterEnum.bad
              ? [{ $match: { userBadFeedback: { $exists: true, $ne: '' } } }]
              : chatLogsFilter === ChatLogsFilterEnum.notFoundKnowledge
                ? [{ $match: { hasNotFoundKnowledge: true } }]
                : []),

          { $sort: { _id: 1 } },
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
    const maxAiId = aiIds[aiIds.length - 1]; // AI messages are already sorted by _id ascending

    // Query Human messages with _id less than the maximum AI _id
    // Use descending sort + limit to get only the most recent Human messages
    // Then reverse to ascending order for efficient pairing
    const humanMessages: any[] = (
      await MongoChatItem.find(
        {
          appId: appObjectId,
          chatId,
          obj: ChatRoleEnum.Human,
          _id: { $lt: maxAiId }
        },
        fieldProjection
      )
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
    aiMessages.forEach((ai) => {
      const human = humanMap.get(ai._id.toString());
      if (human) {
        pairedMessages.push(human);
      }
      pairedMessages.push(ai);
    });

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
