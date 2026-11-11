import { MongoChat } from '../../chat/chatSchema';
import { Types } from '../../../common/mongo';
import { ChatItemCollectionName, ChatItemResponseCollectionName } from '../../chat/constants';
import { readFromSecondary } from '../../../common/mongo/utils';
import { AppVersionCollectionName } from '../../app/version/schema';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

/** 聚合一页应用日志原始行，统计消息、反馈、积分和版本展示数据。 */
export const findAppChatLogPage = async ({
  appId,
  filter,
  sort,
  skip,
  limit
}: {
  appId: string;
  filter: FilterQuery<ChatSchemaType>;
  sort: Record<string, 1 | -1>;
  skip: number;
  limit: number;
}) =>
  MongoChat.aggregate<AppLogsListItemType>(
    [
      { $match: filter },
      { $sort: sort },
      { $skip: skip },
      { $limit: limit },
      {
        $lookup: {
          from: ChatItemCollectionName,
          let: { appId: new Types.ObjectId(appId), chatId: '$chatId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$appId', '$$appId'] },
                    { $eq: ['$chatId', '$$chatId'] },
                    {
                      $or: [
                        { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                        { $eq: [{ $type: '$sourceType' }, 'missing'] }
                      ]
                    }
                  ]
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
                  $and: [
                    { $eq: ['$appId', '$$appId'] },
                    { $eq: ['$chatId', '$$chatId'] },
                    {
                      $or: [
                        { $eq: ['$sourceType', ChatSourceTypeEnum.app] },
                        { $eq: [{ $type: '$sourceType' }, 'missing'] }
                      ]
                    }
                  ]
                }
              }
            },
            {
              $group: {
                _id: null,
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
          errorCount: { $ifNull: ['$errorCount', 0] },
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
          publishSource: 1,
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
  );

/** 统计当前筛选条件下的日志总数。 */
export const countAppChatLogs = (filter: FilterQuery<ChatSchemaType>) =>
  MongoChat.countDocuments(filter, { ...readFromSecondary });
