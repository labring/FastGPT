import { MongoChat } from '../../chat/chatSchema';
import { Types } from '../../../common/mongo';
import { ChatItemCollectionName, ChatItemResponseCollectionName } from '../../chat/constants';
import { parseObjectId, readFromPrimary, readFromSecondary } from '../../../common/mongo/utils';
import { MongoAppVersion } from '../../app/version/schema';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

type AppLogAggregatedRow = Omit<AppLogsListItemType, 'versionName'> & {
  appVersionId?: unknown;
};

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
}) => {
  // 会话、消息和积分保留在同一次从库聚合内，保证同一副本节点一致视图，避免跨滞后从库混读；
  // 大文档 app_versions 改在分页后按最小投影批量查并在未命中时显式回主库确认。
  const rows = await MongoChat.aggregate<AppLogAggregatedRow>(
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
          }
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
          appVersionId: 1,
          region: '$metadata.originIp'
        }
      }
    ],
    { ...readFromSecondary }
  );

  if (rows.length === 0) return [];

  const versionIdMap = new Map<string, Types.ObjectId>();
  for (const row of rows) {
    const oid = parseObjectId(row.appVersionId);
    if (oid) {
      versionIdMap.set(oid.toString(), oid);
    }
  }
  const versionIds = Array.from(versionIdMap.values());

  const versionNameMap = new Map<string, string | null>();
  if (versionIds.length > 0) {
    const secondaryVersions = await MongoAppVersion.find(
      { _id: { $in: versionIds } },
      { _id: 1, versionName: 1 },
      readFromSecondary
    ).lean();
    for (const version of secondaryVersions) {
      versionNameMap.set(String(version._id), version.versionName ?? null);
    }

    // 从库短暂复制延迟导致未命中的版本 ID 显式回主库批量确认，避免继承连接串的从库读偏好。
    const unresolvedVersionIds = versionIds.filter((oid) => !versionNameMap.has(oid.toString()));
    if (unresolvedVersionIds.length > 0) {
      const primaryVersions = await MongoAppVersion.find(
        { _id: { $in: unresolvedVersionIds } },
        { _id: 1, versionName: 1 },
        readFromPrimary
      ).lean();
      for (const version of primaryVersions) {
        versionNameMap.set(String(version._id), version.versionName ?? null);
      }
    }
  }

  return rows.map(({ appVersionId, ...rest }): AppLogsListItemType => {
    const versionOid = parseObjectId(appVersionId);
    const versionName = versionOid ? (versionNameMap.get(versionOid.toString()) ?? null) : null;
    return {
      ...rest,
      versionName
    };
  });
};

/** 统计当前筛选条件下的日志总数。 */
export const countAppChatLogs = (filter: FilterQuery<ChatSchemaType>) =>
  MongoChat.countDocuments(filter, { ...readFromSecondary });
