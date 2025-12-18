import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import type { PipelineStage } from '@fastgpt/service/common/mongo';
import { Types } from '@fastgpt/service/common/mongo';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import {
  ChatItemCollectionName,
  ChatItemResponseCollectionName
} from '@fastgpt/service/core/chat/constants';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { getLocationFromIp } from '@fastgpt/service/common/geo';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { getLocale } from '@fastgpt/service/common/middle/i18n';
import { AppVersionCollectionName } from '@fastgpt/service/core/app/version/schema';
import {
  GetAppChatLogsBodySchema,
  GetAppChatLogsResponseSchema,
  type getAppChatLogsResponseType
} from '@fastgpt/global/openapi/core/app/log/api';

async function handler(
  req: ApiRequestProps,
  _res: NextApiResponse
): Promise<getAppChatLogsResponseType> {
  const { appId, dateStart, dateEnd, sources, tmbIds, chatSearch, feedbackType, unreadOnly } =
    GetAppChatLogsBodySchema.parse(req.body);

  const { pageSize = 20, offset } = parsePaginationRequest(req);

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  const { teamId } = await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

  const where = {
    teamId: new Types.ObjectId(teamId),
    appId: new Types.ObjectId(appId),
    source: sources ? { $in: sources } : { $exists: true },
    tmbId: tmbIds ? { $in: tmbIds.map((item) => new Types.ObjectId(item)) } : { $exists: true },
    // Feedback type filtering (BEFORE pagination for performance)
    ...(feedbackType === 'has_feedback' &&
      !unreadOnly && {
        $or: [{ hasGoodFeedback: true }, { hasBadFeedback: true }]
      }),
    ...(feedbackType === 'has_feedback' &&
      unreadOnly && {
        $or: [{ hasUnreadGoodFeedback: true }, { hasUnreadBadFeedback: true }]
      }),
    ...(feedbackType === 'good' &&
      !unreadOnly && {
        hasGoodFeedback: true
      }),
    ...(feedbackType === 'good' &&
      unreadOnly && {
        hasUnreadGoodFeedback: true
      }),
    ...(feedbackType === 'bad' &&
      !unreadOnly && {
        hasBadFeedback: true
      }),
    ...(feedbackType === 'bad' &&
      unreadOnly && {
        hasUnreadBadFeedback: true
      }),
    updateTime: {
      $gte: new Date(dateStart),
      $lte: new Date(dateEnd)
    },
    ...(chatSearch
      ? {
          $or: [
            { chatId: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
            { title: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
            { customTitle: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } }
          ]
        }
      : undefined)
  };

  // Execute both queries
  const [listResult, total] = await Promise.all([
    // Execute the main aggregation
    MongoChat.aggregate(
      [
        { $match: where },
        { $sort: { updateTime: -1 } },
        { $skip: offset },
        { $limit: pageSize },
        // Match chat_items for other statistics
        {
          $lookup: {
            from: ChatItemCollectionName,
            let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$appId', '$$appId'] }, { $eq: ['$chatId', '$$chatId'] }]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  messageCount: { $sum: 1 },
                  totalResponseTime: {
                    $sum: {
                      $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
                    }
                  },
                  aiMessageCount: {
                    $sum: {
                      $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
                    }
                  },
                  adminMark: {
                    $sum: {
                      $cond: [{ $ifNull: ['$adminFeedback', false] }, 1, 0]
                    }
                  },
                  goodFeedback: {
                    $sum: {
                      $cond: [{ $ifNull: ['$userGoodFeedback', false] }, 1, 0]
                    }
                  },
                  badFeedback: {
                    $sum: {
                      $cond: [{ $ifNull: ['$userBadFeedback', false] }, 1, 0]
                    }
                  },
                  customFeedback: {
                    $sum: {
                      $cond: [{ $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }, 1, 0]
                    }
                  },
                  errorCountFromChatItem: {
                    $sum: {
                      $cond: [
                        {
                          $gt: [
                            {
                              $size: {
                                $filter: {
                                  input: { $ifNull: ['$responseData', []] },
                                  as: 'item',
                                  cond: { $ne: [{ $ifNull: ['$$item.errorText', null] }, null] }
                                }
                              }
                            },
                            0
                          ]
                        },
                        1,
                        0
                      ]
                    }
                  },
                  totalPointsFromChatItem: {
                    $sum: {
                      $reduce: {
                        input: { $ifNull: ['$responseData', []] },
                        initialValue: 0,
                        in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
                      }
                    }
                  }
                }
              }
            ],
            as: 'chatItemsData'
          }
        },
        // Match chatItemResponses
        {
          $lookup: {
            from: ChatItemResponseCollectionName,
            let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ['$appId', '$$appId'] }, { $eq: ['$chatId', '$$chatId'] }]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  // errorCount from chatItemResponse data
                  errorCountFromResponse: {
                    $sum: {
                      $cond: [{ $ne: [{ $ifNull: ['$data.errorText', null] }, null] }, 1, 0]
                    }
                  },
                  // totalPoints from chatItemResponse data
                  totalPointsFromResponse: {
                    $sum: { $ifNull: ['$data.totalPoints', 0] }
                  }
                }
              }
            ],
            as: 'chatItemResponsesData'
          }
        },
        // Match app versions
        {
          $lookup: {
            from: AppVersionCollectionName,
            localField: 'appVersionId',
            foreignField: '_id',
            pipeline: [
              {
                $project: {
                  versionName: 1,
                  _id: 0 // 排除 _id 字段，只返回 versionName
                }
              }
            ],
            as: 'versionData'
          }
        },
        {
          $addFields: {
            messageCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.messageCount', 0] }, 0] },
            // Use feedback counts from Chat table (redundant fields)
            userGoodFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.goodFeedback', 0] }, 0]
            },
            userBadFeedbackCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.badFeedback', 0] }, 0]
            },
            customFeedbacksCount: {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.customFeedback', 0] }, 0]
            },
            markCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.adminMark', 0] }, 0] },
            averageResponseTime: {
              $cond: [
                {
                  $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatItemsData.aiMessageCount', 0] }, 0] }, 0]
                },
                {
                  $divide: [
                    { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalResponseTime', 0] }, 0] },
                    { $ifNull: [{ $arrayElemAt: ['$chatItemsData.aiMessageCount', 0] }, 1] }
                  ]
                },
                0
              ]
            },
            errorCount: {
              $add: [
                { $ifNull: [{ $arrayElemAt: ['$chatItemsData.errorCountFromChatItem', 0] }, 0] }, // 适配旧版，响应字段存在 chat_items 里
                {
                  $ifNull: [
                    { $arrayElemAt: ['$chatItemResponsesData.errorCountFromResponse', 0] },
                    0
                  ]
                }
              ]
            },
            totalPoints: {
              $add: [
                { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPointsFromChatItem', 0] }, 0] },
                {
                  $ifNull: [
                    { $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] },
                    0
                  ]
                }
              ]
            },
            versionName: { $ifNull: [{ $arrayElemAt: ['$versionData.versionName', 0] }, null] }
          }
        },
        {
          $project: {
            _id: { $toString: '$_id' },
            chatId: 1,
            title: 1,
            customTitle: 1,
            source: 1,
            sourceName: 1,
            updateTime: 1,
            createTime: 1,
            messageCount: 1,
            userGoodFeedbackCount: 1,
            userBadFeedbackCount: 1,
            customFeedbacksCount: 1,
            markCount: 1,
            averageResponseTime: 1,
            errorCount: 1,
            totalPoints: 1,
            outLinkUid: 1,
            tmbId: {
              $cond: {
                if: { $eq: ['$tmbId', null] },
                then: null,
                else: { $toString: '$tmbId' }
              }
            },
            versionName: 1,
            region: '$metadata.originIp'
          }
        }
      ],
      { ...readFromSecondary }
    ),
    // Execute the count pipeline
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  const list = listResult;

  const listWithRegion = list.map((item) => {
    const ip = item.region;
    const region = getLocationFromIp(ip, getLocale(req));

    return {
      ...item,
      region: region || ip
    };
  });

  // 获取有 tmbId 的人员
  const listWithSourceMember = await addSourceMember({
    list: listWithRegion
  });
  // 获取没有 tmbId 的人员
  const listWithoutTmbId = listWithRegion.filter((item) => !item.tmbId);
  return GetAppChatLogsResponseSchema.parse({
    list: listWithSourceMember.concat(listWithoutTmbId),
    total
  });
}

export default NextAPI(handler);
