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

  // Auth check
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
    // Feedback type filtering
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

  const [aggregateResult, total] = await Promise.all([
    // Main aggregation with parallel $lookup operations
    MongoChat.aggregate(
      [
        { $match: where },
        { $sort: { updateTime: -1 } },
        { $skip: offset },
        { $limit: pageSize },
        {
          $facet: {
            // Branch 1: Lookup chat_items statistics
            chatItemsStats: [
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
                            $cond: [
                              { $eq: ['$obj', 'AI'] },
                              { $ifNull: ['$durationSeconds', 0] },
                              0
                            ]
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
                            $cond: [
                              { $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] },
                              1,
                              0
                            ]
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
                                        cond: {
                                          $ne: [{ $ifNull: ['$$item.errorText', null] }, null]
                                        }
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
              {
                $project: {
                  chatItemsData: { $arrayElemAt: ['$chatItemsData', 0] }
                }
              }
            ],
            // Branch 2: Lookup chat_item_responses statistics
            chatItemResponsesStats: [
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
                        errorCountFromResponse: {
                          $sum: {
                            $cond: [{ $ne: [{ $ifNull: ['$data.errorText', null] }, null] }, 1, 0]
                          }
                        },
                        totalPointsFromResponse: {
                          $sum: { $ifNull: ['$data.totalPoints', 0] }
                        }
                      }
                    }
                  ],
                  as: 'chatItemResponsesData'
                }
              },
              {
                $project: {
                  chatItemResponsesData: { $arrayElemAt: ['$chatItemResponsesData', 0] }
                }
              }
            ],
            // Branch 3: Lookup app versions
            appVersionStats: [
              {
                $lookup: {
                  from: AppVersionCollectionName,
                  let: { appVersionId: '$appVersionId' },
                  pipeline: [
                    {
                      $match: {
                        $expr: {
                          $and: [
                            { $ne: ['$$appVersionId', null] },
                            { $ne: ['$$appVersionId', undefined] },
                            { $eq: ['$_id', '$$appVersionId'] }
                          ]
                        }
                      }
                    },
                    {
                      $project: {
                        versionName: 1
                      }
                    }
                  ],
                  as: 'versionData'
                }
              },
              {
                $project: {
                  versionData: { $arrayElemAt: ['$versionData', 0] }
                }
              }
            ],
            // Branch 4: Keep original document fields
            originalDoc: [
              {
                $project: {
                  _id: 1,
                  chatId: 1,
                  title: 1,
                  customTitle: 1,
                  source: 1,
                  sourceName: 1,
                  updateTime: 1,
                  createTime: 1,
                  outLinkUid: 1,
                  tmbId: 1,
                  region: '$metadata.originIp'
                }
              }
            ]
          }
        },
        // 🔥 Merge the parallel results back together
        {
          $project: {
            merged: {
              $map: {
                input: { $range: [0, { $size: '$originalDoc' }] },
                as: 'idx',
                in: {
                  $mergeObjects: [
                    { $arrayElemAt: ['$originalDoc', '$$idx'] },
                    { $arrayElemAt: ['$chatItemsStats', '$$idx'] },
                    { $arrayElemAt: ['$chatItemResponsesStats', '$$idx'] },
                    { $arrayElemAt: ['$appVersionStats', '$$idx'] }
                  ]
                }
              }
            }
          }
        },
        { $unwind: '$merged' },
        { $replaceRoot: { newRoot: '$merged' } },
        // Calculate final statistics
        {
          $addFields: {
            messageCount: { $ifNull: ['$chatItemsData.messageCount', 0] },
            userGoodFeedbackCount: {
              $ifNull: ['$chatItemsData.goodFeedback', 0]
            },
            userBadFeedbackCount: {
              $ifNull: ['$chatItemsData.badFeedback', 0]
            },
            customFeedbacksCount: {
              $ifNull: ['$chatItemsData.customFeedback', 0]
            },
            markCount: { $ifNull: ['$chatItemsData.adminMark', 0] },
            averageResponseTime: {
              $cond: [
                {
                  $gt: [{ $ifNull: ['$chatItemsData.aiMessageCount', 0] }, 0]
                },
                {
                  $divide: [
                    { $ifNull: ['$chatItemsData.totalResponseTime', 0] },
                    { $ifNull: ['$chatItemsData.aiMessageCount', 1] }
                  ]
                },
                0
              ]
            },
            errorCount: {
              $add: [
                { $ifNull: ['$chatItemsData.errorCountFromChatItem', 0] },
                {
                  $ifNull: ['$chatItemResponsesData.errorCountFromResponse', 0]
                }
              ]
            },
            totalPoints: {
              $add: [
                { $ifNull: ['$chatItemsData.totalPointsFromChatItem', 0] },
                {
                  $ifNull: ['$chatItemResponsesData.totalPointsFromResponse', 0]
                }
              ]
            },
            versionName: { $ifNull: ['$versionData.versionName', null] }
          }
        },
        // Final projection
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
            region: 1
          }
        }
      ],
      { ...readFromSecondary }
    ),
    // Count query (already parallel)
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  const list = aggregateResult;

  // Add region information
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
