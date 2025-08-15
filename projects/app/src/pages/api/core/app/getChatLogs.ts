import type { NextApiRequest, NextApiResponse } from 'next';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { type AppLogsListItemType } from '@/types/app';
import { Types } from '@fastgpt/service/common/mongo';
import { addDays } from 'date-fns';
import type { GetAppChatLogsParams } from '@/global/core/api/appReq.d';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { ChatItemCollectionName } from '@fastgpt/service/core/chat/chatItemSchema';
import { NextAPI } from '@/service/middleware/entry';
import { readFromSecondary } from '@fastgpt/service/common/mongo/utils';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { addSourceMember } from '@fastgpt/service/support/user/utils';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { AppReadChatLogPerVal } from '@fastgpt/global/support/permission/app/constant';
import { CommonErrEnum } from '@fastgpt/global/common/error/code/common';

async function handler(
  req: NextApiRequest,
  _res: NextApiResponse
): Promise<PaginationResponse<AppLogsListItemType>> {
  const {
    appId,
    dateStart = addDays(new Date(), -7),
    dateEnd = new Date(),
    sources,
    tmbIds,
    chatSearch
  } = req.body as GetAppChatLogsParams;

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
    ...(chatSearch && {
      $or: [
        { chatId: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
        { title: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } },
        { customTitle: { $regex: new RegExp(`${replaceRegChars(chatSearch)}`, 'i') } }
      ]
    })
  };

  const [list, total] = await Promise.all([
    MongoChat.aggregate(
      [
        { $match: where },
        {
          $sort: {
            updateTime: -1
          }
        },
        { $skip: offset },
        { $limit: pageSize },
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
                  errorCount: {
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
                  totalPoints: {
                    $sum: {
                      $reduce: {
                        input: { $ifNull: ['$responseData', []] },
                        initialValue: 0,
                        in: {
                          $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }]
                        }
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
            errorCount: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.errorCount', 0] }, 0] },
            totalPoints: { $ifNull: [{ $arrayElemAt: ['$chatItemsData.totalPoints', 0] }, 0] }
          }
        },
        {
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
            tmbId: 1
          }
        }
      ],
      {
        ...readFromSecondary
      }
    ),
    MongoChat.countDocuments(where, { ...readFromSecondary })
  ]);

  const listWithSourceMember = await addSourceMember({
    list
  });

  const listWithoutTmbId = list.filter((item) => !item.tmbId);

  return {
    list: listWithSourceMember.concat(listWithoutTmbId),
    total
  };
}

export default NextAPI(handler);
