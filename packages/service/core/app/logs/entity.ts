import { MongoChat } from '../../chat/chatSchema';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { MongoChatItemResponse } from '../../chat/chatItemResponseSchema';
import { Types } from '../../../common/mongo';
import { parseObjectId, readFromSecondary } from '../../../common/mongo/utils';
import { MongoAppVersion } from '../../app/version/schema';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

type ChatItemPageStats = {
  _id: string;
  messageCount: number;
  totalResponseTime: number;
  aiMessageCount: number;
  adminMark: number;
  goodFeedback: number;
  badFeedback: number;
  customFeedback: number;
  totalPointsFromChatItem: number;
};

type ChatItemResponsePageStats = {
  _id: string;
  totalPointsFromResponse: number;
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
  const chats = await MongoChat.find(
    filter,
    {
      _id: 1,
      chatId: 1,
      title: 1,
      customTitle: 1,
      source: 1,
      sourceName: 1,
      publishSource: 1,
      updateTime: 1,
      createTime: 1,
      errorCount: 1,
      outLinkUid: 1,
      tmbId: 1,
      appVersionId: 1,
      'metadata.originIp': 1
    },
    readFromSecondary
  )
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  if (chats.length === 0) return [];

  const appObjectId = new Types.ObjectId(appId);
  const chatIds = Array.from(new Set(chats.map((chat) => chat.chatId).filter(Boolean)));
  const versionIdMap = new Map<string, Types.ObjectId>();
  for (const chat of chats) {
    const oid = parseObjectId(chat.appVersionId);
    if (oid) {
      versionIdMap.set(oid.toString(), oid);
    }
  }
  const versionIds = Array.from(versionIdMap.values());

  const sourceFilter = {
    appId: appObjectId,
    chatId: { $in: chatIds },
    $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
  };

  const [chatItemStats, responseStats, versions] = await Promise.all([
    chatIds.length > 0
      ? MongoChatItem.aggregate<ChatItemPageStats>(
          [
            { $match: sourceFilter },
            {
              $group: {
                _id: '$chatId',
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
          { ...readFromSecondary }
        )
      : Promise.resolve([]),
    chatIds.length > 0
      ? MongoChatItemResponse.aggregate<ChatItemResponsePageStats>(
          [
            { $match: sourceFilter },
            {
              $group: {
                _id: '$chatId',
                totalPointsFromResponse: {
                  $sum: { $ifNull: ['$data.totalPoints', 0] }
                }
              }
            }
          ],
          { ...readFromSecondary }
        )
      : Promise.resolve([]),
    versionIds.length > 0
      ? MongoAppVersion.find(
          { _id: { $in: versionIds } },
          { _id: 1, versionName: 1 },
          readFromSecondary
        ).lean()
      : Promise.resolve([])
  ]);

  const itemStatsMap = new Map(chatItemStats.map((item) => [item._id, item]));
  const responseStatsMap = new Map(responseStats.map((item) => [item._id, item]));
  const versionNameMap = new Map<string, string | null>(
    versions.map((version) => [String(version._id), version.versionName ?? null])
  );

  return chats.map((chat): AppLogsListItemType => {
    const itemStats = itemStatsMap.get(chat.chatId);
    const responseStat = responseStatsMap.get(chat.chatId);
    const aiMessageCount = itemStats?.aiMessageCount ?? 0;
    const totalResponseTime = itemStats?.totalResponseTime ?? 0;
    const averageResponseTime = aiMessageCount > 0 ? totalResponseTime / aiMessageCount : 0;
    const totalPoints =
      (itemStats?.totalPointsFromChatItem ?? 0) + (responseStat?.totalPointsFromResponse ?? 0);
    const versionOid = parseObjectId(chat.appVersionId);
    const versionName = versionOid ? (versionNameMap.get(versionOid.toString()) ?? null) : null;

    return {
      _id: String(chat._id),
      chatId: chat.chatId,
      title: chat.title,
      customTitle: chat.customTitle,
      source: chat.source,
      sourceName: chat.sourceName,
      publishSource: chat.publishSource,
      updateTime: chat.updateTime,
      createTime: chat.createTime,
      messageCount: itemStats?.messageCount ?? 0,
      userGoodFeedbackCount: itemStats?.goodFeedback ?? 0,
      userBadFeedbackCount: itemStats?.badFeedback ?? 0,
      customFeedbacksCount: itemStats?.customFeedback ?? 0,
      markCount: itemStats?.adminMark ?? 0,
      averageResponseTime,
      errorCount: chat.errorCount ?? 0,
      totalPoints,
      outLinkUid: chat.outLinkUid,
      tmbId: chat.tmbId === null || chat.tmbId === undefined ? null : String(chat.tmbId),
      versionName,
      region: chat.metadata?.originIp
    };
  });
};

/** 统计当前筛选条件下的日志总数。 */
export const countAppChatLogs = (filter: FilterQuery<ChatSchemaType>) =>
  MongoChat.countDocuments(filter, { ...readFromSecondary });
