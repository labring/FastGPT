import { MongoChat } from '../../chat/chatSchema';
import { MongoChatItem } from '../../chat/chatItemSchema';
import { MongoChatItemResponse } from '../../chat/chatItemResponseSchema';
import { Types } from '../../../common/mongo';
import {
  collectUniqueObjectIds,
  parseObjectId,
  readFromSecondary,
  toObjectIdHex
} from '../../../common/mongo/utils';
import { MongoAppVersion } from '../../app/version/schema';
import type { AppLogsListItemType } from '@fastgpt/global/openapi/core/app/log/api';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { FilterQuery } from 'mongoose';
import type { ChatSchemaType } from '@fastgpt/global/core/chat/type';

const APP_CHAT_LOG_BASE_PROJECTION = {
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
  'metadata.originIp': 1
} as const;

/** 列表与导出共用的 AI 响应耗时统计 $group 字段，确保计算口径一致。 */
const chatItemResponseTimeGroupFields = {
  totalResponseTime: {
    $sum: {
      $cond: [{ $eq: ['$obj', 'AI'] }, { $ifNull: ['$durationSeconds', 0] }, 0]
    }
  },
  aiMessageCount: {
    $sum: {
      $cond: [{ $eq: ['$obj', 'AI'] }, 1, 0]
    }
  }
};

/** 列表与导出共用的历史内联积分 $group 字段，避免口径漂移。 */
const chatItemLegacyPointsGroupField = {
  totalPointsFromChatItem: {
    $sum: {
      $reduce: {
        input: { $ifNull: ['$responseData', []] },
        initialValue: 0,
        in: { $add: ['$$value', { $ifNull: ['$$this.totalPoints', 0] }] }
      }
    }
  }
};

/** 构造按 appId + chatIds 批量聚合 chatitems / chatitemresponses 的统一过滤条件。 */
const buildAppChatItemBatchFilter = (appId: string, chatIds: string[]) => ({
  appId: parseObjectId(appId) ?? new Types.ObjectId(appId),
  chatId: { $in: chatIds },
  $or: [{ sourceType: ChatSourceTypeEnum.app }, { sourceType: { $exists: false } }]
});

/** 计算单条日志的平均响应耗时（秒）。 */
export const computeAverageResponseTime = (totalResponseTime = 0, aiMessageCount = 0): number =>
  aiMessageCount > 0 ? totalResponseTime / aiMessageCount : 0;

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

export type AppChatLogExportDoc = Pick<
  ChatSchemaType,
  | '_id'
  | 'chatId'
  | 'title'
  | 'customTitle'
  | 'source'
  | 'sourceName'
  | 'publishSource'
  | 'updateTime'
  | 'createTime'
  | 'errorCount'
  | 'outLinkUid'
  | 'tmbId'
> & {
  appVersionId?: unknown;
  variables?: Record<string, any>;
  metadata?: { originIp?: string };
};

export type ExportChatItemBatchStats = {
  _id: string;
  messageCount: number;
  totalResponseTime?: number;
  aiMessageCount?: number;
  totalPointsFromChatItem?: number;
  chatDetails: Array<{ id: Types.ObjectId; value: any }>;
  userGoodFeedbackItems?: Array<{ _id: Types.ObjectId; userGoodFeedback: any }>;
  userBadFeedbackItems?: Array<{ _id: Types.ObjectId; userBadFeedback: any }>;
  customFeedbackItems?: Array<{ _id: Types.ObjectId; customFeedbacks: any }>;
  markItems?: Array<{ _id: Types.ObjectId; adminFeedback: any }>;
};

/** 批量统计一组会话在 chatitemresponses 中的节点总积分（弱一致性只读从库）。 */
export const findChatResponsePointsMap = async ({
  appId,
  chatIds
}: {
  appId: string;
  chatIds: string[];
}): Promise<Map<string, number>> => {
  if (chatIds.length === 0) return new Map();

  const stats = await MongoChatItemResponse.aggregate<ChatItemResponsePageStats>(
    [
      { $match: buildAppChatItemBatchFilter(appId, chatIds) },
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
  );

  return new Map(stats.map((item) => [item._id, item.totalPointsFromResponse || 0]));
};

/** 按有效 ObjectId 批量回表查询应用版本名，返回小写 hex 键的映射。 */
export const findAppVersionNameMap = async (
  rawVersionIds: Iterable<unknown>
): Promise<Map<string, string | null>> => {
  const versionIds = collectUniqueObjectIds(rawVersionIds);
  if (versionIds.length === 0) return new Map();

  const versions = await MongoAppVersion.find(
    { _id: { $in: versionIds } },
    { _id: 1, versionName: 1 },
    readFromSecondary
  ).lean();

  return new Map(
    versions.map((version) => [
      toObjectIdHex(version._id) ?? String(version._id),
      version.versionName ?? null
    ])
  );
};

/**
 * 面向多批次流式导出的版本名加载器：
 * - 命中结果直接跨批次缓存；
 * - 从库查空最多重试 `maxMissRetries` 次（默认 1 次），兼顾短暂复制延迟追平与防止已删历史版本在数百批次中反复空查。
 */
export const createAppVersionNameLoader = ({
  maxMissRetries = 1
}: { maxMissRetries?: number } = {}) => {
  const resolvedMap = new Map<string, string>();
  const missAttempts = new Map<string, number>();

  const preload = async (rawVersionIds: Iterable<unknown>) => {
    const missingIds = collectUniqueObjectIds(rawVersionIds, { exclude: resolvedMap });
    if (missingIds.length === 0) return;

    const fetchedMap = await findAppVersionNameMap(missingIds);

    for (const requestedId of missingIds) {
      const idHex = requestedId.toHexString();
      if (fetchedMap.has(idHex)) {
        resolvedMap.set(idHex, fetchedMap.get(idHex) || '');
        missAttempts.delete(idHex);
        continue;
      }
      const attempts = (missAttempts.get(idHex) ?? 0) + 1;
      if (attempts > maxMissRetries) {
        resolvedMap.set(idHex, '');
        missAttempts.delete(idHex);
      } else {
        missAttempts.set(idHex, attempts);
      }
    }
  };

  const get = (rawVersionId: unknown): string => {
    const idHex = toObjectIdHex(rawVersionId);
    return idHex ? (resolvedMap.get(idHex) ?? '') : '';
  };

  return { preload, get };
};

/** 按导出列按需批量聚合 chatitems 详情、反馈、响应时长与历史内联积分。 */
export const findExportChatItemStatsMap = async ({
  appId,
  chatIds,
  needResponseTime,
  needPoints,
  needFeedback,
  needCustomFeedback,
  needAnnotated
}: {
  appId: string;
  chatIds: string[];
  needResponseTime: boolean;
  needPoints: boolean;
  needFeedback: boolean;
  needCustomFeedback: boolean;
  needAnnotated: boolean;
}): Promise<Map<string, ExportChatItemBatchStats>> => {
  if (chatIds.length === 0) return new Map();

  const needFeedbackMeta = needFeedback || needCustomFeedback || needAnnotated;
  const groupStage: Record<string, any> = {
    _id: '$chatId',
    messageCount: { $sum: 1 },
    chatDetails: {
      $push: {
        id: '$_id',
        value: '$value'
      }
    }
  };
  if (needResponseTime) {
    Object.assign(groupStage, chatItemResponseTimeGroupFields);
  }
  if (needPoints) {
    Object.assign(groupStage, chatItemLegacyPointsGroupField);
  }
  if (needFeedbackMeta) {
    groupStage.feedbackMeta = {
      $push: {
        _id: '$_id',
        ...(needFeedback
          ? {
              userGoodFeedback: '$userGoodFeedback',
              userBadFeedback: '$userBadFeedback'
            }
          : {}),
        ...(needCustomFeedback ? { customFeedbacks: '$customFeedbacks' } : {}),
        ...(needAnnotated ? { adminFeedback: '$adminFeedback' } : {})
      }
    };
  }

  const projectStage: Record<string, any> = {
    _id: 1,
    messageCount: 1,
    chatDetails: { $slice: ['$chatDetails', -100] }
  };
  if (needResponseTime) {
    projectStage.totalResponseTime = 1;
    projectStage.aiMessageCount = 1;
  }
  if (needPoints) {
    projectStage.totalPointsFromChatItem = 1;
  }
  if (needFeedback) {
    projectStage.userGoodFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.userGoodFeedback', false] }
      }
    };
    projectStage.userBadFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.userBadFeedback', false] }
      }
    };
  }
  if (needCustomFeedback) {
    projectStage.customFeedbackItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $gt: [{ $size: { $ifNull: ['$$item.customFeedbacks', []] } }, 0] }
      }
    };
  }
  if (needAnnotated) {
    projectStage.markItems = {
      $filter: {
        input: '$feedbackMeta',
        as: 'item',
        cond: { $ifNull: ['$$item.adminFeedback', false] }
      }
    };
  }

  const stats = await MongoChatItem.aggregate<ExportChatItemBatchStats>(
    [
      { $match: buildAppChatItemBatchFilter(appId, chatIds) },
      { $sort: { _id: 1 } },
      { $group: groupStage },
      { $project: projectStage }
    ],
    { ...readFromSecondary, allowDiskUse: true }
  );

  return new Map(stats.map((item) => [item._id, item]));
};

/** 创建流式日志导出主游标，按列需求最小化投影避免读取无关大字段。 */
export const createAppChatLogExportCursor = ({
  filter,
  needVersionName,
  needVariables,
  limit = 50000,
  batchSize = 1000
}: {
  filter: FilterQuery<ChatSchemaType>;
  needVersionName: boolean;
  needVariables: boolean;
  limit?: number;
  batchSize?: number;
}) =>
  MongoChat.find(
    filter,
    {
      ...APP_CHAT_LOG_BASE_PROJECTION,
      ...(needVariables ? { variables: 1 } : {}),
      ...(needVersionName ? { appVersionId: 1 } : {})
    },
    readFromSecondary
  )
    .sort({ updateTime: -1 })
    .limit(limit)
    .lean<AppChatLogExportDoc>()
    .cursor({ batchSize });

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
      ...APP_CHAT_LOG_BASE_PROJECTION,
      appVersionId: 1
    },
    readFromSecondary
  )
    .sort(sort)
    .skip(skip)
    .limit(limit)
    .lean();

  if (chats.length === 0) return [];

  const chatIds = Array.from(new Set(chats.map((chat) => chat.chatId).filter(Boolean)));

  const [chatItemStats, responsePointsMap, versionNameMap] = await Promise.all([
    chatIds.length > 0
      ? MongoChatItem.aggregate<ChatItemPageStats>(
          [
            { $match: buildAppChatItemBatchFilter(appId, chatIds) },
            {
              $group: {
                _id: '$chatId',
                messageCount: { $sum: 1 },
                ...chatItemResponseTimeGroupFields,
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
                ...chatItemLegacyPointsGroupField
              }
            }
          ],
          { ...readFromSecondary }
        )
      : Promise.resolve([]),
    findChatResponsePointsMap({ appId, chatIds }),
    findAppVersionNameMap(chats.map((chat) => chat.appVersionId))
  ]);

  const itemStatsMap = new Map(chatItemStats.map((item) => [item._id, item]));

  return chats.map((chat): AppLogsListItemType => {
    const itemStats = itemStatsMap.get(chat.chatId);
    const averageResponseTime = computeAverageResponseTime(
      itemStats?.totalResponseTime,
      itemStats?.aiMessageCount
    );
    const totalPoints =
      (itemStats?.totalPointsFromChatItem ?? 0) + (responsePointsMap.get(chat.chatId) ?? 0);
    const versionIdHex = toObjectIdHex(chat.appVersionId);
    const versionName = versionIdHex ? (versionNameMap.get(versionIdHex) ?? null) : null;

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
