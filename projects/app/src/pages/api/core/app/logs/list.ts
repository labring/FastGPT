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
  const {
    appId,
    dateStart,
    dateEnd,
    sources,
    tmbIds,
    outLinkUids,
    chatSearch,
    feedbackType,
    unreadOnly,
    errorFilter
  } = GetAppChatLogsBodySchema.parse(req.body);

  const { pageSize = 20, offset } = parsePaginationRequest(req);

  if (!appId) {
    return Promise.reject(CommonErrEnum.missingParams);
  }

  // 凭证校验
  await authApp({
    req,
    authToken: true,
    appId,
    per: AppReadChatLogPerVal
  });

  const where = {
    appId: new Types.ObjectId(appId),
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
    ...(sources && { source: { $in: sources } }),
    ...(tmbIds || outLinkUids
      ? {
          $or: [
            ...(tmbIds?.length
              ? [
                  {
                    tmbId: { $in: tmbIds.map((item) => new Types.ObjectId(item)) },
                    $or: [{ outLinkUid: { $exists: false } }, { outLinkUid: { $in: [null, ''] } }]
                  }
                ]
              : []),
            ...(outLinkUids?.length ? [{ outLinkUid: { $in: outLinkUids } }] : [])
          ]
        }
      : {}),
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

  const lookupAndComputeStages: PipelineStage[] = [
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
                $sum: { $size: { $ifNull: ['$customFeedbacks', []] } }
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
      $lookup: {
        from: AppVersionCollectionName,
        localField: 'appVersionId',
        foreignField: '_id',
        as: 'versionData'
      }
    },
    {
      $addFields: {
        messageCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.messageCount', 0] }, 0] },
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
            { $ifNull: [{ $arrayElemAt: ['$chatItemsData.errorCountFromChatItem', 0] }, 0] },
            {
              $ifNull: [{ $arrayElemAt: ['$chatItemResponsesData.errorCountFromResponse', 0] }, 0]
            }
          ]
        },
        totalPoints: {
          $add: [
            { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPointsFromChatItem', 0] }, 0] },
            {
              $ifNull: [{ $arrayElemAt: ['$chatItemResponsesData.totalPointsFromResponse', 0] }, 0]
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
  ];

  const hasErrorFilter = errorFilter === 'has_error';

  const { list, total } = await (async () => {
    if (hasErrorFilter) {
      const fullPipeline: PipelineStage[] = [
        { $match: where },
        { $sort: { updateTime: -1 } },
        ...lookupAndComputeStages,
        { $match: { errorCount: { $gt: 0 } } }
      ];

      const listPipeline: PipelineStage[] = [
        ...fullPipeline,
        { $skip: offset },
        { $limit: pageSize }
      ];
      const countPipeline: PipelineStage[] = [...fullPipeline, { $count: 'total' }];

      const [listRes, countRes] = await Promise.all([
        MongoChat.aggregate(listPipeline, { ...readFromSecondary }),
        MongoChat.aggregate(countPipeline, { ...readFromSecondary })
      ]);

      return { list: listRes, total: (countRes[0]?.total as number) ?? 0 };
    }

    const listPipeline: PipelineStage[] = [
      { $match: where },
      { $sort: { updateTime: -1 } },
      { $skip: offset },
      { $limit: pageSize },
      ...lookupAndComputeStages
    ];

    const [listRes, countRes] = await Promise.all([
      MongoChat.aggregate(listPipeline, { ...readFromSecondary }),
      MongoChat.countDocuments(where, { ...readFromSecondary })
    ]);

    return { list: listRes, total: countRes };
  })();

  const listWithRegion = list.map((item) => {
    const ip = item.region;
    const region = getLocationFromIp(ip, getLocale(req));

    return {
      ...item,
      originIp: ip,
      region: region || ip
    };
  });

  const listWithSourceMember = await addSourceMember({ list: listWithRegion });
  const sourceMemberIds = new Set(listWithSourceMember.map((item) => String(item._id)));

  const listWithoutSourceMember = listWithRegion.filter(
    (item) => !sourceMemberIds.has(String(item._id))
  );

  const mergedList = listWithSourceMember.concat(listWithoutSourceMember);
  mergedList.sort((a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime());

  return GetAppChatLogsResponseSchema.parse({
    list: mergedList,
    total
  });
}

export default NextAPI(handler);
