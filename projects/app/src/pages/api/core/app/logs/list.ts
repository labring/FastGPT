import type { NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { PipelineStage, Types } from '@fastgpt/service/common/mongo';
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
  const { appId, dateStart, dateEnd, sources, tmbIds, chatSearch, feedbackType } =
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

  // Build the aggregation pipeline
  const pipeline: PipelineStage[] = [
    { $match: where },
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
              goodFeedback: {
                $sum: {
                  $cond: [
                    {
                      $ifNull: ['$userGoodFeedback', false]
                    },
                    1,
                    0
                  ]
                }
              },
              badFeedback: {
                $sum: {
                  $cond: [
                    {
                      $ifNull: ['$userBadFeedback', false]
                    },
                    1,
                    0
                  ]
                }
              },
              customFeedback: {
                $sum: {
                  $cond: [{ $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }, 1, 0]
                }
              },
              adminMark: {
                $sum: {
                  $cond: [
                    {
                      $ifNull: ['$adminFeedback', false]
                    },
                    1,
                    0
                  ]
                }
              },
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
              // errorCount from chatItem responseData
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
              // totalPoints from chatItem responseData
              totalPointsFromChatItem: {
                $sum: {
                  $reduce: {
                    input: { $ifNull: ['$responseData', []] },
                    initialValue: 0,
                    in: {
                      $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }]
                    }
                  }
                }
              },
              // Unread feedback statistics
              unreadFeedbackCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$obj', 'AI'] },
                        { $ne: ['$adminReadStatus', true] },
                        {
                          $or: [
                            { $ifNull: ['$userGoodFeedback', false] },
                            { $ifNull: ['$userBadFeedback', false] },
                            { $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }
                          ]
                        }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              unreadGoodFeedbackCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$obj', 'AI'] },
                        { $ne: ['$adminReadStatus', true] },
                        { $ifNull: ['$userGoodFeedback', false] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              unreadBadFeedbackCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$obj', 'AI'] },
                        { $ne: ['$adminReadStatus', true] },
                        { $ifNull: ['$userBadFeedback', false] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              },
              unreadCustomFeedbackCount: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $eq: ['$obj', 'AI'] },
                        { $ne: ['$adminReadStatus', true] },
                        { $gt: [{ $size: { $ifNull: ['$customFeedbacks', []] } }, 0] }
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
        as: 'chatItemsData'
      }
    }
  ];

  // Add lookup for chatItemResponse data
  pipeline.push({
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
          $addFields: {
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
      as: 'chatItemResponsesData'
    }
  });

  // Add feedback type filtering if specified
  if (feedbackType === 'good') {
    pipeline.push({
      $match: {
        $expr: {
          $gt: [
            {
              $ifNull: [{ $arrayElemAt: ['$chatItemsData.goodFeedback', 0] }, 0]
            },
            0
          ]
        }
      }
    });
  } else if (feedbackType === 'bad') {
    pipeline.push({
      $match: {
        $expr: {
          $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatItemsData.badFeedback', 0] }, 0] }, 0]
        }
      }
    });
  }

  // Add fields projection
  pipeline.push({
    $addFields: {
      messageCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.messageCount', 0] }, 0] },
      hasUnreadFeedback: {
        $gt: [{ $ifNull: [{ $arrayElemAt: ['$chatItemsData.unreadFeedbackCount', 0] }, 0] }, 0]
      },
      unreadFeedbackCount: {
        $ifNull: [{ $arrayElemAt: ['$chatItemsData.unreadFeedbackCount', 0] }, 0]
      },
      userGoodFeedbackCount: {
        $ifNull: [{ $arrayElemAt: ['$chatItemsData.goodFeedback', 0] }, 0]
      },
      userBadFeedbackCount: {
        $ifNull: [{ $arrayElemAt: ['$chatItemsData.badFeedback', 0] }, 0]
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
      // Merge errorCount from both sources
      errorCount: {
        $add: [
          { $ifNull: [{ $arrayElemAt: ['$chatItemsData.errorCountFromChatItem', 0] }, 0] },
          {
            $ifNull: [{ $arrayElemAt: ['$chatItemResponsesData.errorCountFromResponse', 0] }, 0]
          }
        ]
      },
      // Merge totalPoints from both sources
      totalPoints: {
        $add: [
          { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPointsFromChatItem', 0] }, 0] },
          {
            $ifNull: [{ $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] }, 0]
          }
        ]
      }
    }
  });

  // Add projection
  pipeline.push({
    $project: {
      _id: 1,
      id: '$chatId',
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
      tmbId: 1,
      hasUnreadFeedback: 1,
      unreadFeedbackCount: 1,
      region: '$metadata.originIp'
    }
  });

  // For counting, we need to use the same pipeline but without sort, skip, limit, and projection
  const countPipeline = [...pipeline];
  countPipeline.push({
    $count: 'total'
  });

  // Execute both queries
  const [listResult, countResult] = await Promise.all([
    // Execute the main aggregation with sort, skip, and limit
    MongoChat.aggregate(
      [...pipeline, { $sort: { updateTime: -1 } }, { $skip: offset }, { $limit: pageSize }],
      { ...readFromSecondary }
    ),

    // Execute the count pipeline
    MongoChat.aggregate(countPipeline, { ...readFromSecondary })
  ]);

  const list = listResult;
  const total = countResult[0]?.total || 0;

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
